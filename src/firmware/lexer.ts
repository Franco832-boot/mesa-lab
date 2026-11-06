import { fail, MAX_SOURCE_LENGTH } from './errors';
import type { SourceSpan } from './errors';

export interface Token {
  kind: 'name' | 'number' | 'symbol' | 'end';
  text: string;
  at: SourceSpan;
}

/** Regexes recognize individual lexical tokens only; grammar lives in parser.ts. */
export function tokenize(source: string): readonly Token[] {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH) fail('source-limit');
  // C++ preprocessing splices lines before stripping comments. Until a complete
  // preprocessor exists, reject splicing everywhere rather than executing a
  // physical line that the actual C++ compiler would treat as a comment.
  const splice = /\\\r?\n/.exec(source);
  if (splice) {
    const prefix = source.slice(0, splice.index);
    fail('unsupported-syntax', { offset: splice.index, line: prefix.split('\n').length, column: splice.index - prefix.lastIndexOf('\n') });
  }
  const tokens: Token[] = [];
  let offset = 0, line = 1, column = 1, header = false;
  const consume = (count: number) => {
    for (let i = 0; i < count; i++) {
      if (source[offset++] === '\n') { line++; column = 1; } else column++;
    }
  };
  while (offset < source.length) {
    const at = { offset, line, column };
    const rest = source.slice(offset);
    const whitespace = /^\s+/.exec(rest);
    if (whitespace) { consume(whitespace[0].length); continue; }
    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n');
      consume(end < 0 ? rest.length : end);
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) fail('unsupported-syntax', at);
      consume(end + 2);
      continue;
    }
    if (rest[0] === '#' && !header && tokens.length === 0) {
      const include = /^#\s*include\s*<Arduino\.h>[^\S\r\n]*(?:\r?\n|$)/.exec(rest);
      if (!include) fail('unsupported-syntax', at);
      consume(include[0].length); header = true; continue;
    }
    const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    const number = /^[0-9]+(?:[uU][lL]?|[lL][uU]?)?/.exec(rest);
    const symbol = /^(?:\+\+|--|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|&&|\|\||[(){};,=+\-*/%!<>])/.exec(rest);
    const text = name?.[0] ?? number?.[0] ?? symbol?.[0];
    if (!text) fail('unsupported-syntax', at);
    tokens.push({ kind: name ? 'name' : number ? 'number' : 'symbol', text, at });
    consume(text.length);
  }
  tokens.push({ kind: 'end', text: '', at: { offset, line, column } });
  return tokens;
}
