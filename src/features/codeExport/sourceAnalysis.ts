/** Advisory scanning only: this does not parse, compile or rewrite C++. */
export function withoutComments(source: string): string {
  let output = '', quote = '', mode: 'code' | 'line' | 'block' = 'code';
  for (let index = 0; index < source.length; index++) {
    const char = source[index] ?? '', next = source[index + 1];
    if (mode === 'line') { output += char === '\n' ? '\n' : ' '; if (char === '\n') mode = 'code'; }
    else if (mode === 'block') {
      if (char === '*' && next === '/') { output += '  '; index++; mode = 'code'; }
      else output += char === '\n' ? '\n' : ' ';
    } else if (quote) {
      output += char;
      if (char === '\\' && next !== undefined) { output += next; index++; }
      else if (char === quote) quote = '';
    } else if (char === '/' && (next === '/' || next === '*')) { mode = next === '/' ? 'line' : 'block'; output += '  '; index++; }
    else { output += char; if (char === '"' || char === "'") quote = char; }
  }
  return output;
}
export function analyzeSource(source: string) {
  const code = withoutComments(source);
  const includes = [...code.matchAll(/^\s*#\s*include\s*([<"])([^>"\r\n]+)[>"]/gm)].map(match => ({ name: match[2] ?? '', local: match[1] === '"' }));
  const identifiers = code.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, ' ');
  const exclusive = [...new Set([
    ...includes.filter(header => /(?:mesalab|mesa[_-]?sim|losprofesparavos|simulator)/i.test(header.name)).map(header => header.name),
    ...[...identifiers.matchAll(/\b(?:MesaLab|MesaSim|LosProfesParaVos(?:Lab)?|Simulator|Simulador)\s*(?:::|\.)\s*[A-Za-z_]\w*|\b(?:mesa_|simulator_|simulador_|lpvSim_)\w*\s*(?=\()/g)].map(match => match[0]),
  ])];
  return { includes, exclusive,
    credentials: /\bWiFi\s*\.\s*begin\s*\(|\b(?:password|passphrase|passwd|psk|ssid|wifi_pass|wifi_password)\b\s*(?:\[[^\]]*\])?\s*=|#\s*define\s+\w*(?:PASS|PSK|SSID)\w*\s+/i.test(code),
    littleFS: includes.some(header => header.name === 'LittleFS.h') || /\bLittleFS\s*\./.test(identifiers),
  };
}
