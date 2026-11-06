import { describe, expect, it } from 'vitest';
import { parseSketch } from './parser';
import { UnoExecutionError } from './errors';

describe('Arduino source AST', () => {
  it('retains statement/argument positions across comments and CRLF', () => {
    const ast = parseSketch('/* prefix */\r\nvoid setup(){\r\n  pinMode(13, OUTPUT);\r\n}\r\nvoid loop(){delay(1000);}');
    expect(ast.setup[0]).toMatchObject({ kind: 'call', name: 'pinMode', at: { line: 3, column: 3 } });
    const statement = ast.setup[0];
    if (statement?.kind !== 'call') throw new Error('Expected a call');
    expect(statement.args[0]).toMatchObject({ kind: 'atom', token: '13', at: { line: 3, column: 11 } });
    expect(ast.loop[0]).toMatchObject({ name: 'delay' });
  });
  it('reports a malformed statement at its original source position', () => {
    try { parseSketch('void setup(){}\nvoid loop(){\n  unknown();\n}'); }
    catch (error) {
      expect(error).toBeInstanceOf(UnoExecutionError);
      if (error instanceof UnoExecutionError) expect(error.location).toMatchObject({ line: 3, column: 3 });
      return;
    }
    throw new Error('Expected a parser error');
  });
  it('rejects preprocessor line splicing even inside a comment', () => {
    const source = 'void setup(){}\nvoid loop(){// comment' + '\\' + '\n digitalWrite(13,HIGH);delay(1000);}';
    expect(() => parseSketch(source)).toThrow(UnoExecutionError);
  });
});
