import type { BoardKind } from '../model/types';
import type {
  BinaryOperator,
  Declaration,
  Expression,
  GpioCall,
  SketchAst,
  Statement,
  ValueType,
} from './ast';
import { fail, MAX_AST_NODES } from './errors';
import type { SourceSpan } from './errors';
import { parseSketch } from './parser';
import { builtinEffect, constantValue } from './profile';
import { binary, unary } from './values';
import type { Value } from './values';
import { CLOCK_BUILTINS, GPIO_BUILTINS } from './builtins';
import { LIBRARIES, methodSignature } from './libraries';
import type { LibraryClass } from './libraries';
import type { ObjectDeclaration } from './ast';

type Operation =
  | { op: 'construct'; name: string; className: LibraryClass; arity: number }
  | { op: 'method'; receiver: string; name: string }
  | { op: 'isnan' }
  | { op: 'serial-begin' }
  | { op: 'serial-text'; text: string; newline: boolean }
  | { op: 'serial-number'; digits: boolean; newline: boolean }
  | { op: 'push'; value: Value }
  | { op: 'load'; name: string }
  | {
      op: 'declare';
      name: string;
      valueType: ValueType;
      constant: boolean;
      initialized: boolean;
      global: boolean;
    }
  | { op: 'store'; name: string; compound: BinaryOperator | null }
  | { op: 'update'; name: string; delta: 1 | -1; prefix: boolean }
  | { op: 'unary'; operator: '+' | '-' | '!' }
  | { op: 'binary'; operator: BinaryOperator }
  | { op: 'clock'; name: 'millis' | 'micros' }
  | { op: 'call'; name: GpioCall; arity: number }
  | { op: 'jump'; target: number }
  | { op: 'branch'; target: number; when: boolean }
  | { op: 'drop' | 'boolean' | 'enter' | 'leave' | 'start-loop' | 'repeat' | 'return' };
export type Instruction = Operation & { at: SourceSpan };
export interface UnoProgram extends SketchAst {
  board: BoardKind;
  code: readonly Instruction[];
  loopPc: number;
}
interface Binding {
  type: ValueType;
  constant: boolean;
}
const reserved = new Set([
  'void',
  'setup',
  'loop',
  'if',
  'else',
  'while',
  'do',
  'for',
  'switch',
  'return',
  'break',
  'continue',
  'int',
  'long',
  'bool',
  'unsigned',
  'const',
  'float', 'isnan', 'DHT', 'Serial',
  ...Object.keys(GPIO_BUILTINS),
  ...Object.keys(CLOCK_BUILTINS),
]);

function references(value: Expression, name: string): boolean {
  switch (value.kind) {
    case 'string': return false;
    case 'isnan': return references(value.value, name);
    case 'method': return value.receiver === name || value.args.some((arg) => references(arg, name));
    case 'atom':
      return value.token === name;
    case 'clock':
      return false;
    case 'unary':
      return references(value.value, name);
    case 'binary':
      return references(value.left, name) || references(value.right, name);
    case 'assign':
      return value.name === name || references(value.value, name);
    case 'update':
      return value.name === name;
  }
}

class Compiler {
  private code: Instruction[] = [];
  private scopes: Map<string, Binding>[] = [new Map()];
  private objects = new Map<string, LibraryClass>([['Serial', 'Serial']]);
  constructor(private readonly board: BoardKind) {}
  private emit(operation: Operation, at: SourceSpan): number {
    if (this.code.length >= MAX_AST_NODES * 8) fail('instruction-limit', at);
    this.code.push({ ...operation, at });
    return this.code.length - 1;
  }
  private patch(index: number, target: number): void {
    const instruction = this.code[index];
    if (!instruction || (instruction.op !== 'jump' && instruction.op !== 'branch'))
      fail('unsupported-syntax');
    this.code[index] = { ...instruction, target };
  }
  private binding(name: string, at: SourceSpan, mutable = false): Binding {
    for (const scope of [...this.scopes].reverse()) {
      const binding = scope.get(name);
      if (binding) {
        if (mutable && binding.constant) fail('type-error', at);
        return binding;
      }
    }
    return fail('name-error', at);
  }
  private fold(value: Expression): Value | null {
    switch (value.kind) {
      case 'atom':
        return constantValue(value.token, this.board, value.at);
      case 'unary': {
        const operand = this.fold(value.value);
        return operand ? unary(value.operator, operand, this.board, value.at) : null;
      }
      case 'binary': {
        const a = this.fold(value.left);
        if (!a) return null;
        if (value.operator === '&&' && a.value === 0) return { type: 'bool', value: 0 };
        if (value.operator === '||' && a.value !== 0) return { type: 'bool', value: 1 };
        const b = this.fold(value.right);
        return b ? binary(value.operator, a, b, this.board, value.at) : null;
      }
      default:
        return null;
    }
  }
  private expression(value: Expression, allowVoid = false): void {
    const at = value.at;
    switch (value.kind) {
      case 'string': return fail('type-error', at);
      case 'isnan': this.expression(value.value); this.emit({ op: 'isnan' }, at); return;
      case 'method': {
        const type = this.objects.get(value.receiver);
        if (!type) return fail('name-error', at);
        const signature = methodSignature(type, value.name);
        if (!signature) return fail('unsupported-syntax', at);
        if (value.args.length < signature.minArgs || value.args.length > signature.maxArgs || (!allowVoid && signature.result === 'void')) return fail('type-error', at);
        if (type === 'Serial') {
          const argument = value.args[0];
          if (value.name === 'begin') {
            if (!argument) return fail('type-error', at);
            this.expression(argument); this.emit({ op: 'serial-begin' }, at);
          } else if (!argument || argument.kind === 'string') {
            if (value.args.length > 1) return fail('type-error', at);
            this.emit({ op: 'serial-text', text: argument?.kind === 'string' ? argument.value : '', newline: value.name === 'println' }, at);
          } else {
            for (const arg of value.args) this.expression(arg);
            this.emit({ op: 'serial-number', digits: value.args.length === 2, newline: value.name === 'println' }, at);
          }
          this.emit({ op: 'push', value: { type: 'int', value: 0 } }, at);
        } else this.emit({ op: 'method', receiver: value.receiver, name: value.name }, at);
        return;
      }
      case 'atom': {
        const constant = constantValue(value.token, this.board, at);
        if (constant) this.emit({ op: 'push', value: constant }, at);
        else {
          // Preserve the existing invalid-pin diagnostic for unsupported board symbols.
          if (
            /^[AD][0-9]+$/.test(value.token) &&
            !this.scopes.some((scope) => scope.has(value.token))
          )
            fail('invalid-value', at);
          this.binding(value.token, at);
          this.emit({ op: 'load', name: value.token }, at);
        }
        return;
      }
      case 'clock':
        this.emit({ op: 'clock', name: value.name }, at);
        return;
      case 'unary':
        this.expression(value.value);
        this.emit({ op: 'unary', operator: value.operator }, at);
        return;
      case 'update': {
        if (this.binding(value.name, at, true).type === 'bool') fail('type-error', at);
        this.emit(
          {
            op: 'update',
            name: value.name,
            delta: value.operator === '++' ? 1 : -1,
            prefix: value.prefix,
          },
          at,
        );
        return;
      }
      case 'assign': {
        this.binding(value.name, at, true);
        this.expression(value.value);
        let compound: BinaryOperator | null = null;
        switch (value.operator) {
          case '+=':
            compound = '+';
            break;
          case '-=':
            compound = '-';
            break;
          case '*=':
            compound = '*';
            break;
          case '/=':
            compound = '/';
            break;
          case '%=':
            compound = '%';
            break;
        }
        this.emit({ op: 'store', name: value.name, compound }, at);
        return;
      }
      case 'binary': {
        this.expression(value.left);
        if (value.operator === '&&' || value.operator === '||') {
          const when = value.operator === '||';
          const short = this.emit({ op: 'branch', when, target: 0 }, at);
          this.expression(value.right);
          this.emit({ op: 'boolean' }, at);
          const end = this.emit({ op: 'jump', target: 0 }, at);
          this.patch(short, this.code.length);
          this.emit({ op: 'push', value: { type: 'bool', value: Number(when) } }, at);
          this.patch(end, this.code.length);
        } else {
          this.expression(value.right);
          this.emit({ op: 'binary', operator: value.operator }, at);
        }
        return;
      }
    }
  }
  private declaration(value: Declaration, global = false): void {
    const scope = this.scopes.at(-1) ?? fail('name-error', value.at);
    if (
      scope.has(value.name) || this.objects.has(value.name) ||
      reserved.has(value.name) ||
      constantValue(value.name, this.board, value.at)
    )
      fail('name-error', value.at);
    if (value.initializer && references(value.initializer, value.name))
      fail('type-error', value.at);
    if (value.initializer) this.expression(value.initializer);
    this.emit(
      {
        op: 'declare',
        name: value.name,
        valueType: value.valueType,
        constant: value.constant,
        initialized: value.initializer !== null,
        global,
      },
      value.at,
    );
    scope.set(value.name, { type: value.valueType, constant: value.constant });
  }
  private scoped(body: readonly Statement[], at: SourceSpan): void {
    this.scopes.push(new Map());
    this.emit({ op: 'enter' }, at);
    for (const statement of body) this.statement(statement);
    this.emit({ op: 'leave' }, at);
    this.scopes.pop();
  }
  private statement(value: Statement): void {
    switch (value.kind) {
      case 'return': this.emit({ op: 'return' }, value.at); return;
      case 'empty':
        return;
      case 'block':
        this.scoped(value.body, value.at);
        return;
      case 'declare':
        this.declaration(value);
        return;
      case 'expression':
        this.expression(value.value, true);
        this.emit({ op: 'drop' }, value.at);
        return;
      case 'call': {
        const constants = value.args.map((arg) => this.fold(arg));
        if (constants.every((arg): arg is Value => arg !== null))
          builtinEffect(value.name, constants, this.board, value.at);
        for (const arg of value.args) this.expression(arg);
        this.emit({ op: 'call', name: value.name, arity: value.args.length }, value.at);
        return;
      }
      case 'if': {
        this.expression(value.condition);
        const alternate = this.emit({ op: 'branch', when: false, target: 0 }, value.at);
        this.scoped([value.then], value.then.at);
        const end = this.emit({ op: 'jump', target: 0 }, value.at);
        this.patch(alternate, this.code.length);
        if (value.otherwise) this.scoped([value.otherwise], value.otherwise.at);
        this.patch(end, this.code.length);
        return;
      }
    }
  }
  compile(ast: SketchAst): UnoProgram {
    const at = { offset: 0, line: 1, column: 1 };
    for (const declaration of ast.globals) {
      if (declaration.kind === 'construct') this.construct(declaration, ast.headers);
      else this.declaration(declaration, true);
    }
    this.scoped(ast.setup, ast.setup[0]?.at ?? at);
    this.emit({ op: 'start-loop' }, at);
    const loopPc = this.code.length;
    this.scoped(ast.loop, ast.loop[0]?.at ?? at);
    this.emit({ op: 'repeat' }, at);
    return { ...ast, board: this.board, code: this.code, loopPc };
  }
  private construct(value: ObjectDeclaration, headers: readonly string[]): void {
    const contract = LIBRARIES[value.className];
    if (!contract.header || !headers.includes(contract.header)) return fail('unsupported-syntax', value.at);
    if (this.objects.has(value.name) || reserved.has(value.name) || this.scopes.some((scope) => scope.has(value.name)) || constantValue(value.name, this.board, value.at)) return fail('name-error', value.at);
    for (const arg of value.args) this.expression(arg);
    this.emit({ op: 'construct', name: value.name, className: value.className, arity: value.args.length }, value.at);
    this.objects.set(value.name, value.className);
  }
}

export function compileArduinoSubset(source: string, board: BoardKind = 'arduino-uno'): UnoProgram {
  if (board !== 'arduino-uno' && board !== 'esp8266') return fail('invalid-value');
  return new Compiler(board).compile(parseSketch(source));
}
