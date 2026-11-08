import type { BoardKind, SourceFile } from '../model/types';
import { compileAst } from './compiler';
import { fail, MAX_SOURCE_LENGTH } from './errors';
import { tokenize } from './lexer';
import type { Token } from './lexer';
import { parseTokens } from './parser';

/** Flat project-local linking, with no filesystem/network or native compilation. */
export function compileProjectFiles(files: readonly SourceFile[], board: BoardKind) {
  const visited = new Set<string>(), visiting = new Set<string>();
  const result: Token[] = [];
  let length = 0;
  let end: Token = { kind: 'end', text: '', at: { file: 'main.ino', offset: 0, line: 1, column: 1 } };
  const visit = (name: string, include?: Token) => {
    if (visiting.has(name)) return fail('include-cycle', include?.at);
    if (visited.has(name)) return;
    const file = files.find((item) => item.name === name);
    if (!file) return fail('missing-file', include ? { ...include.at, file: `${include.at.file ?? 'main.ino'} → ${name}` } : { file: name, offset: 0, line: 1, column: 1 });
    length += file.source.length;
    if (length > MAX_SOURCE_LENGTH) fail('source-limit');
    visiting.add(name);
    for (const token of tokenize(file.source, name, true)) {
      if (token.kind === 'include') {
        if (!token.text.endsWith('.h')) fail('unsupported-syntax', token.at);
        visit(token.text, token);
      } else if (token.kind === 'end') end = token;
      else result.push(token);
    }
    visiting.delete(name); visited.add(name);
  };
  visit('main.ino');
  // Arduino-style project build: every .cpp is a translation input, including
  // helpers whose filename differs from the included header.
  for (const file of files) if (file.name.endsWith('.cpp')) visit(file.name);
  result.push(end);
  return compileAst(parseTokens(result), board);
}
