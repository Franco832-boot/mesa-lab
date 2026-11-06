import type { BinaryOperator, Declaration, Expression, SketchAst, Statement, ValueType } from './ast';
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
  constructor(private readonly tokens: readonly Token[]) {}
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
  private isDeclaration(): boolean { return ['const', 'int', 'bool', 'long', 'unsigned'].includes(this.peek().text); }
  private declaration(): Declaration {
    const at = this.peek().at;
    const constant = this.match('const');
    const type = this.take();
    let valueType: ValueType;
    if (type.text === 'unsigned') { this.expect('long'); valueType = 'unsigned long'; }
    else if (type.text === 'int' || type.text === 'bool' || type.text === 'long') valueType = type.text;
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
      if (this.isDeclaration()) return this.declaration();
      if (this.match(';')) return { kind: 'empty', at };
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
      if (token.text === '(') { value = this.expression(); this.expect(')'); }
      else if (token.kind === 'name' && this.match('(')) {
        if (!isClockCall(token.text)) fail('unsupported-syntax', at);
        this.expect(')'); value = this.expressionNode({ kind: 'clock', name: token.text, at });
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
    const sections = new Map<string, readonly Statement[]>(), globals: Declaration[] = [];
    while (this.peek().kind !== 'end') {
      if (this.isDeclaration()) {
        if (++this.statements > MAX_PROGRAM_INSTRUCTIONS || ++this.nodes > MAX_AST_NODES) fail('instruction-limit', this.peek().at);
        globals.push(this.declaration()); continue;
      }
      this.expect('void'); const name = this.take();
      if (!['setup', 'loop'].includes(name.text) || sections.has(name.text)) fail('unsupported-syntax', name.at);
      this.expect('('); this.expect(')'); sections.set(name.text, this.body());
    }
    const setup = sections.get('setup'), loop = sections.get('loop');
    if (!setup || !loop) fail('unsupported-syntax', this.peek().at);
    return { globals, setup, loop };
  }
}

export function parseSketch(source: string): SketchAst { return new Parser(tokenize(source)).parse(); }
