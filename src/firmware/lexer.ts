import { fail, MAX_SOURCE_LENGTH } from './errors';
import type { SourceSpan } from './errors';
import { LIBRARIES } from './libraries';
const supportedHeaders = new Set(['Arduino.h', ...Object.values(LIBRARIES).flatMap((library) => library.header ? [library.header] : [])]);

export interface Token {
  kind: 'name' | 'number' | 'string' | 'header' | 'define' | 'symbol' | 'end';
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
  let offset = 0, line = 1, column = 1;
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
    if (rest[0] === '#') {
      const include = /^#[ \t]*include[ \t]*(?:<([A-Za-z_][A-Za-z_0-9.]*)>|"([A-Za-z_][A-Za-z_0-9.]*)")[^\S\r\n]*(?:\r?\n|$)/.exec(rest);
      const define = /^#[ \t]*define[ \t]+([A-Za-z_][A-Za-z_0-9]*)[ \t]+([A-Za-z_][A-Za-z_0-9]*|(?:0[xX][0-9a-fA-F]+|[0-9]+(?:\.[0-9]+)?)(?:[uU][lL]|[lL])?)[ \t]*(?:\/\/[^\r\n]*)?(?:\r?\n|$)/.exec(rest);
      const header = include?.[1] ?? include?.[2];
      if (include && header && supportedHeaders.has(header)) { tokens.push({ kind: 'header', text: header, at }); consume(include[0].length); continue; }
      if (define?.[1] && define[2]) { tokens.push({ kind: 'define', text: `${define[1]} ${define[2]}`, at }); consume(define[0].length); continue; }
      fail('unsupported-syntax', at);
    }
    if (rest.startsWith("'")) {
      const character = /^'(?:[^'\\\r\n]|\\['\\nrt])'/.exec(rest);
      if (!character) return fail('unsupported-syntax', at);
      const literal = character[0].slice(1, -1);
      const escaped: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', "'": "'", '\\': '\\' };
      const value = literal.startsWith('\\') ? escaped[literal[1] ?? ''] : literal;
      if (!value || value.length !== 1 || value.charCodeAt(0) > 255) return fail('invalid-value', at);
      tokens.push({ kind: 'number', text: String(value.charCodeAt(0)), at }); consume(character[0].length); continue;
    }
    const name = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    const number = /^(?:0[xX][0-9a-fA-F]+(?:[uU][lL]?|[lL][uU]?)?|(?:[0-9]+\.[0-9]*|\.[0-9]+|[0-9]+[eE][+-]?[0-9]+)(?:[eE][+-]?[0-9]+)?[fF]?|[0-9]+[fF]|[0-9]+(?:[uU][lL]?|[lL][uU]?)?)/.exec(rest);
    const string = /^"(?:[^"\\\r\n]|\\["\\nrt])*"/.exec(rest);
    const symbol = /^(?:\+\+|--|\+=|-=|\*=|\/=|%=|==|!=|<=|>=|&&|\|\||[.(){};,=+\-*/%!<>])/.exec(rest);
    const text = name?.[0] ?? number?.[0] ?? string?.[0] ?? symbol?.[0];
    if (!text) fail('unsupported-syntax', at);
    tokens.push({ kind: name ? 'name' : number ? 'number' : string ? 'string' : 'symbol', text, at });
    consume(text.length);
  }
  tokens.push({ kind: 'end', text: '', at: { offset, line, column } });
  return tokens;
}
