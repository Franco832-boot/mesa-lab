import type { SourceSpan } from './errors';
import type { ClockCall, GpioCall } from './builtins';
import type { LibraryClass } from './libraries';
export type { GpioCall } from './builtins';

export interface Atom {
  kind: 'atom';
  token: string;
  at: SourceSpan;
}
export type ValueType = 'int' | 'long' | 'unsigned long' | 'bool' | 'float';
export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';
export type Expression = Atom
  | { kind: 'string'; value: string; at: SourceSpan }
  | { kind: 'isnan'; value: Expression; at: SourceSpan }
  | { kind: 'method'; receiver: string; name: string; args: readonly Expression[]; at: SourceSpan }
  | { kind: 'clock'; name: ClockCall; at: SourceSpan }
  | { kind: 'unary'; operator: '+' | '-' | '!'; value: Expression; at: SourceSpan }
  | { kind: 'binary'; operator: BinaryOperator; left: Expression; right: Expression; at: SourceSpan }
  | { kind: 'assign'; name: string; operator: '=' | '+=' | '-=' | '*=' | '/=' | '%='; value: Expression; at: SourceSpan }
  | { kind: 'update'; name: string; operator: '++' | '--'; prefix: boolean; at: SourceSpan };
export interface Declaration {
  kind: 'declare'; name: string; valueType: ValueType; constant: boolean;
  initializer: Expression | null; at: SourceSpan;
}
export interface CallStatement {
  kind: 'call';
  name: GpioCall;
  args: readonly Expression[];
  at: SourceSpan;
}
export interface ObjectDeclaration { kind: 'construct'; className: LibraryClass; name: string; args: readonly Expression[]; at: SourceSpan }
export type Statement = CallStatement | Declaration
  | { kind: 'return'; at: SourceSpan }
  | { kind: 'block'; body: readonly Statement[]; at: SourceSpan }
  | { kind: 'if'; condition: Expression; then: Statement; otherwise: Statement | null; at: SourceSpan }
  | { kind: 'expression'; value: Expression; at: SourceSpan }
  | { kind: 'empty'; at: SourceSpan };
export interface SketchAst {
  globals: readonly (Declaration | ObjectDeclaration)[];
  headers: readonly string[];
  setup: readonly Statement[];
  loop: readonly Statement[];
}
