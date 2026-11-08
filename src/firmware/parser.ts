import type { BinaryOperator, Declaration, Expression, ObjectDeclaration, SketchAst, Statement, TextDeclaration, ValueType } from './ast';
import { isLibraryClass, LIBRARIES } from './libraries';
import { fail, MAX_AST_NODES, MAX_NESTING, MAX_PROGRAM_INSTRUCTIONS } from './errors';
import { tokenize } from './lexer';
import type { Token } from './lexer';
import { GPIO_BUILTINS, isClockCall, isGpioCall } from './builtins';

const precedence: Readonly<Partial<Record<string, number>>> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
};
function binaryOperator(text: string): BinaryOperator {
  switch (text) {
    case '||': case '&&': case '==': case '!=': case '<': case '<=': case '>': case '>=':
    case '+': case '-': case '*': case '/': case '%': return text;
    default: return fail('unsupported-syntax');
  }
}

class Parser {
  private cursor = 0;
  private statements = 0;
  private nodes = 0;
  private nesting = 0;
  private heights = new WeakMap<Expression, number>();
  private readonly functionNames: ReadonlySet<string>;
  constructor(private readonly tokens: readonly Token[]) {
    this.functionNames = new Set(tokens.flatMap((token, index) => token.text === 'void' && tokens[index + 1]?.kind === 'name' && tokens[index + 2]?.text === '(' ? [tokens[index + 1]?.text ?? ''] : []));
  }
  private peek(): Token { return this.tokens[this.cursor] ?? fail('unsupported-syntax'); }
  private take(): Token { const token = this.peek(); this.cursor++; return token; }
  private expect(text: string): Token {
    const token = this.take();
    if (token.text !== text) fail('unsupported-syntax', token.at);
    return token;
  }
  private match(text: string): boolean {
    if (this.peek().text !== text) return false;
    this.cursor++; return true;
  }
  private nested<T>(parse: () => T): T {
    if (++this.nesting > MAX_NESTING) fail('nesting-limit', this.peek().at);
    const result = parse(); this.nesting--; return result;
  }
  private expressionNode(value: Expression, children: readonly Expression[] = []): Expression {
    const height = 1 + Math.max(0, ...children.map((child) => this.heights.get(child) ?? 0));
    if (height > MAX_NESTING) fail('nesting-limit', value.at);
    if (++this.nodes > MAX_AST_NODES) fail('instruction-limit', value.at);
    this.heights.set(value, height); return value;
  }
  private isDeclaration(): boolean { return ['const', 'int', 'bool', 'long', 'unsigned', 'float'].includes(this.peek().text); }
  private arguments(): Expression[] {
    this.expect('('); const args: Expression[] = [];
    if (this.peek().text !== ')') do { args.push(this.expression()); } while (this.match(','));
    this.expect(')'); return args;
  }
  private isTextDeclaration(): boolean { return this.peek().text === 'const' && this.tokens[this.cursor + 1]?.text === 'char'; }
  private textDeclaration(): TextDeclaration {
    const at = this.expect('const').at;
    this.expect('char'); this.expect('*');
    const name = this.take();
    if (name.kind !== 'name') return fail('unsupported-syntax', name.at);
    this.expect('='); const value = this.take();
    if (value.kind !== 'string') return fail('unsupported-syntax', value.at);
    const text: unknown = JSON.parse(value.text);
    if (typeof text !== 'string') return fail('type-error', value.at);
    this.expect(';'); return { kind: 'text-declare', name: name.text, value: text, at };
  }
  private declaration(): Declaration {
    const at = this.peek().at;
    const constant = this.match('const');
    const type = this.take();
    let valueType: ValueType;
    if (type.text === 'unsigned') { this.expect('long'); valueType = 'unsigned long'; }
    else if (type.text === 'int' || type.text === 'bool' || type.text === 'long' || type.text === 'float') valueType = type.text;
    else return fail('unsupported-syntax', type.at);
    const name = this.take();
    if (name.kind !== 'name') fail('unsupported-syntax', name.at);
    const initializer = this.match('=') ? this.expression() : null;
    if (constant && !initializer) fail('type-error', name.at);
    this.expect(';');
    return { kind: 'declare', name: name.text, valueType, constant, initializer, at };
  }
  private body(): readonly Statement[] {
    this.expect('{');
    const body: Statement[] = [];
    while (this.peek().text !== '}') body.push(this.statement());
    this.expect('}'); return body;
  }
  private statement(): Statement {
    return this.nested(() => {
      const token = this.peek(), at = token.at;
      if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', at);
      if (token.text === '{') return { kind: 'block', body: this.body(), at };
      if (this.isTextDeclaration()) return this.textDeclaration();
      if (this.isDeclaration()) return this.declaration();
      if (this.match(';')) return { kind: 'empty', at };
      if (this.match('return')) { this.expect(';'); return { kind: 'return', at }; }
      if (this.match('for')) {
        this.expect('(');
        let initializer: Declaration | Expression | null = null;
        if (this.isDeclaration()) initializer = this.declaration();
        else if (!this.match(';')) { initializer = this.expression(); this.expect(';'); }
        const condition = this.peek().text === ';' ? null : this.expression();
        this.expect(';');
        const update = this.peek().text === ')' ? null : this.expression();
        this.expect(')');
        return { kind: 'for', initializer, condition, update, body: this.statement(), at };
      }
      if (this.match('if')) {
        this.expect('('); const condition = this.expression(); this.expect(')');
        const then = this.statement();
        const otherwise = this.match('else') ? this.statement() : null;
        return { kind: 'if', condition, then, otherwise, at };
      }
      if (isGpioCall(token.text)) {
        this.take(); this.expect('(');
        const args: Expression[] = [];
        if (this.peek().text !== ')') {
          do { args.push(this.expression()); } while (this.match(','));
        }
        this.expect(')'); this.expect(';');
        const arity = GPIO_BUILTINS[token.text].arity;
        if (args.length !== arity) fail('unsupported-syntax', at);
        return { kind: 'call', name: token.text, args, at };
      }
      const value = this.expression(); this.expect(';');
      return { kind: 'expression', value, at };
    });
  }
  private expression(minimum = 0): Expression {
    return this.nested(() => {
      let left = this.prefix();
      for (;;) {
        const next = this.peek(), level = precedence[next.text];
        if (level === undefined || level < minimum) break;
        this.take(); const right = this.expression(level + 1);
        left = this.expressionNode({ kind: 'binary', operator: binaryOperator(next.text), left, right, at: next.at }, [left, right]);
      }
      if (minimum === 0) {
        const next = this.peek(), operator = next.text;
        if (operator === '=' || operator === '+=' || operator === '-=' || operator === '*=' || operator === '/=' || operator === '%=') {
          if (left.kind !== 'atom' || !/^[A-Za-z_]/.test(left.token)) fail('unsupported-syntax', next.at);
          this.take(); const value = this.expression();
          return this.expressionNode({ kind: 'assign', name: left.token, operator, value, at: left.at }, [value]);
        }
      }
      return left;
    });
  }
  private prefix(): Expression {
    return this.nested(() => {
      const token = this.take(), at = token.at;
      if (token.text === '!' || token.text === '+' || token.text === '-') {
        const value = this.prefix();
        return this.expressionNode({ kind: 'unary', operator: token.text, value, at }, [value]);
      }
      if (token.text === '++' || token.text === '--') {
        const name = this.take();
        if (name.kind !== 'name') fail('unsupported-syntax', name.at);
        return this.expressionNode({ kind: 'update', name: name.text, operator: token.text, prefix: true, at });
      }
      let value: Expression;
      if (token.kind === 'string') {
        const text: unknown = JSON.parse(token.text);
        if (typeof text !== 'string') fail('unsupported-syntax', at);
        value = this.expressionNode({ kind: 'string', value: text, at });
      } else if (token.text === '(') { value = this.expression(); this.expect(')'); }
      else if (token.kind === 'name' && this.match('.')) {
        const method = this.take();
        if (method.kind !== 'name') fail('unsupported-syntax', method.at);
        const args = this.arguments();
        value = this.expressionNode({ kind: 'method', receiver: token.text, name: method.text, args, at }, args);
      } else if (token.kind === 'name' && this.peek().text === '(') {
        const args = this.arguments();
        if (token.text === 'isnan' && args.length === 1 && args[0]) value = this.expressionNode({ kind: 'isnan', value: args[0], at }, args);
        else if (isClockCall(token.text) && args.length === 0) value = this.expressionNode({ kind: 'clock', name: token.text, at });
        else if (!this.functionNames.has(token.text) && token.text !== 'digitalRead') return fail('name-error', at);
        else value = this.expressionNode({ kind: 'invoke', name: token.text, args, at }, args);
      } else if (token.kind === 'name' || token.kind === 'number') value = this.expressionNode({ kind: 'atom', token: token.text, at });
      else return fail('unsupported-syntax', at);
      const next = this.peek();
      if (next.text === '++' || next.text === '--') {
        if (value.kind !== 'atom' || !/^[A-Za-z_]/.test(value.token)) fail('unsupported-syntax', next.at);
        this.take(); return this.expressionNode({ kind: 'update', name: value.token, operator: next.text, prefix: false, at: next.at });
      }
      return value;
    });
  }
  parse(): SketchAst {
    const functions: SketchAst['functions'][number][] = [];
    const sections = new Map<string, readonly Statement[]>(), globals: (Declaration | ObjectDeclaration | TextDeclaration)[] = [], headers: string[] = [];
    while (this.peek().kind !== 'end') {
      const token = this.peek();
      if (token.kind === 'header') { headers.push(this.take().text); continue; }
      if (token.kind === 'define') {
        this.take();
        const [name, value] = token.text.split(' ');
        if (!name || !value) fail('unsupported-syntax', token.at);
        if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', token.at);
        globals.push({ kind: 'declare', name, valueType: value.includes('.') ? 'float' : /[uU][lL]|[lL][uU]/.test(value) ? 'unsigned long' : 'long', constant: true,
          initializer: this.expressionNode({ kind: 'atom', token: value, at: token.at }), at: token.at }); continue;
      }
      if (isLibraryClass(token.text) && LIBRARIES[token.text].constructorArity !== null) {
        this.take(); const name = this.take();
        if (name.kind !== 'name') fail('unsupported-syntax', name.at);
        const args = this.arguments(); this.expect(';');
        if (args.length !== LIBRARIES[token.text].constructorArity) fail('type-error', token.at);
        if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', token.at);
        globals.push({ kind: 'construct', className: token.text, name: name.text, args, at: token.at }); continue;
      }
      if (this.isTextDeclaration()) {
        if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', token.at);
        globals.push(this.textDeclaration()); continue;
      }
      if (this.isDeclaration()) {
        if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', this.peek().at);
        globals.push(this.declaration()); continue;
      }
      this.expect('void'); const name = this.take();
      if (name.kind !== 'name') fail('unsupported-syntax', name.at);
      this.expect('('); this.expect(')');
      if (this.match(';')) continue; // void f(); prototype; definitions are linked below.
      if (sections.has(name.text)) fail('name-error', name.at);
      const body = this.body();
      if (name.text === 'setup' || name.text === 'loop') sections.set(name.text, body);
      else {
        if (functions.some((fn) => fn.name === name.text)) fail('name-error', name.at);
        functions.push({ name: name.text, body, at: name.at });
      }
    }
    const setup = sections.get('setup'), loop = sections.get('loop');
    if (!setup || !loop) fail('unsupported-syntax', this.peek().at);
    return { globals, setup, loop, headers, functions };
  }
}

export function parseSketch(source: string): SketchAst { return new Parser(tokenize(source)).parse(); }

export function parseTokens(tokens: readonly Token[]): SketchAst { return new Parser(tokens).parse(); }
