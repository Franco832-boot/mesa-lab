import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BoardProgram, SourceFile } from '../../model/types';
import { espWebExampleFiles } from '../../model/espWebExample';
import { defaultMainFile, prepareCodeExport } from './prepareCodeExport';
import { textZip } from './zip';
function program(files: SourceFile[]): BoardProgram {
  return { componentId: 'esp', language: 'arduino-cpp', execution: 'unavailable', source: files[0]?.source ?? '', files, activeFile: files[0]?.name ?? null };
}
const planFor = (files: SourceFile[], main?: string) => prepareCodeExport({ board: 'esp8266', program: program(files), projectName: 'My project', locale: 'es', ...(main ? { main } : {}) });
/** Python's independent standard-library ZIP reader validates directory offsets,
 * UTF-8 text, lengths and CRCs; no exporter code is reused to decode the archive. */
function extracted(bytes: Uint8Array): Record<string, string> {
  // File input avoids a child-stdin EOF delivery limitation in the test host.
  const directory = mkdtempSync(join(tmpdir(), 'lpv-zip-')), path = join(directory, 'code.zip');
  writeFileSync(path, bytes);
  const read = (() => {
    try { return spawnSync('python3', ['-c', 'import sys,json,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert all(f.compress_type==zipfile.ZIP_STORED for f in z.infolist())\nprint(json.dumps({n:z.read(n).decode("utf-8") for n in z.namelist()}))', path], { encoding: 'utf8', timeout: 3000 }); }
    finally { unlinkSync(path); rmdirSync(directory); }
  })();
  expect(read.error).toBeUndefined(); expect(read.status, read.stderr).toBe(0);
  const result: unknown = JSON.parse(read.stdout);
  if (typeof result !== 'object' || result === null || Array.isArray(result)) throw new Error('Invalid ZIP extraction');
  const files: Record<string, string> = {};
  for (const [name, content] of Object.entries(result)) {
    if (typeof content !== 'string') throw new Error('Invalid UTF-8 source');
    files[name] = content;
  }
  return files;
}
describe('Arduino IDE source-only code export', () => {
  it('exports a legacy UNO sketch without modifying syntax, unicode, BOM or line endings', () => {
    const source = '\ufeff// Señal 🧪\r\nvoid setup(){pinMode(13,OUTPUT);}\r\nvoid loop(){digitalWrite(13,HIGH);}\r\n';
    const legacy: BoardProgram = { componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source };
    const before = JSON.stringify(legacy);
    const plan = prepareCodeExport({ board: 'arduino-uno', program: legacy, projectName: '../../Huéspeḋes / circuit', locale: 'en' });
    expect(plan.downloadName).toMatch(/^[A-Za-z0-9_-]+-arduino-uno\.zip$/);
    const files = extracted(textZip(plan.files));
    expect(Object.keys(files)).toEqual(['main/main.ino', 'main/README.md']);
    expect(files['main/main.ino']).toBe(source);
    expect(files['main/README.md']).toContain('Arduino UNO');
    expect(files['main/README.md']).not.toContain('NodeMCU');
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('keeps all actual modular ESP files and puts exact LittleFS resources in data/', () => {
    const files = espWebExampleFiles(); const saved = program(files); const before = JSON.stringify(saved);
    for (const file of files) Object.freeze(file); Object.freeze(files); Object.freeze(saved);
    const plan = prepareCodeExport({ board: 'esp8266', program: saved, projectName: 'ESP web', locale: 'es' });
    const unzipped = extracted(textZip(plan.files));
    for (const file of files) expect(unzipped[`main/${/\.(html|css|js)$/.test(file.name) ? 'data/' : ''}${file.name}`]).toBe(file.source);
    expect(Object.keys(unzipped)).toHaveLength(files.length + 1);
    expect(plan.warnings.find(warning => warning.kind === 'credentials')?.details).toContain('wifi.cpp');
    const readme = unzipped['main/README.md'] ?? '';
    expect(readme).toContain('NodeMCU ESP8266'); expect(readme).toContain('ESP8266WebServer.h');
    expect(readme).toContain('main/data/'); expect(readme).not.toContain('carlos');
    expect(readme).not.toContain('componentId'); expect(Object.keys(unzipped).some(path => path.endsWith('.json'))).toBe(false);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('supports custom primary names and a user-selected main without renaming any source or includes', () => {
    const files = [{ name: 'Radio.h', source: '#pragma once\nvoid start();' }, { name: 'Project.ino', source: '#include "Radio.h"\nvoid setup(){start();} void loop(){}' },
      { name: 'Other.ino', source: '// unchanged' }, { name: 'Radio.cpp', source: '#include "Radio.h"\nvoid start(){}' }];
    expect(defaultMainFile(program(files))).toBe('Project.ino');
    const selected = planFor(files, 'Other.ino');
    expect(selected.folder).toBe('Other');
    const unzipped = extracted(textZip(selected.files));
    for (const file of files) expect(unzipped[`Other/${file.name}`]).toBe(file.source);
    expect(selected.warnings).toContainEqual({ kind: 'multiple-ino', details: ['Project.ino', 'Other.ino'] });
  });
  it('does not invent filesystem use, sources or libraries and reports files that need adaptation', () => {
    const files = [{ name: 'main.ino', source: '#include "Helpers.h"\n#include <DHT.h>\n#include <LosProfesParaVos.h>\nvoid setup(){MesaLab.setPin(2,1);} void loop(){}' },
      { name: 'index.html', source: '<h1>Unsaved UI content</h1>' }, { name: 'helpers.h', source: '#pragma once' }];
    const plan = planFor(files), names = plan.files.map(file => file.path);
    expect(names).not.toContain('main/data/index.html');
    expect(plan.headers).toContain('DHT.h');
    expect(plan.warnings).toContainEqual({ kind: 'web-omitted', details: ['index.html'] });
    expect(plan.warnings.find(warning => warning.kind === 'missing-local')?.details).toContain('Helpers.h');
    expect(plan.warnings.find(warning => warning.kind === 'exclusive-api')?.details).toContain('main.ino: MesaLab.setPin');
    expect(names).not.toContain('main/LosProfesParaVos.h'); expect(names).not.toContain('main/DHT.h');
    const uno = prepareCodeExport({ program: program([{ name: 'main.ino', source: '#include <ESP8266WiFi.h>\nvoid setup(){}void loop(){}' }]), board: 'arduino-uno', projectName: '', locale: 'en' });
    expect(uno.warnings).toContainEqual({ kind: 'board-library', details: ['ESP8266WiFi.h'] });
  });
  it('does not execute or reject C++ outside the interpreter subset; analysis ignores ordinary comments/strings', () => {
    const source = '// #include <LittleFS.h>\n/* MesaLab.setPin(); */\nvoid setup(){auto text="Simulator.run()"; for(auto v : {1,2,3}){}}\nvoid loop(){}';
    const plan = planFor([{ name: 'main.ino', source }]);
    expect(plan.littleFS).toBe(false); expect(plan.warnings).toEqual([]);
    expect(extracted(textZip(plan.files))['main/main.ino']).toBe(source);
  });
  it.each(['../main.ino', '/root.ino', 'C:\\main.ino', 'CON.ino', 'a..ino', 'a'.repeat(60) + '.ino'])('rejects unsafe/incompatible primary filename %s without silently renaming', name => {
    expect(() => planFor([{ name, source: 'void setup(){}' }])).toThrow();
  });
  it('rejects missing main files, duplicates and oversized inputs instead of exporting generic templates', () => {
    expect(() => prepareCodeExport({ board: 'esp8266', program: undefined, projectName: '', locale: 'en' })).toThrow('empty');
    expect(() => planFor([{ name: 'Only.h', source: '' }])).toThrow('missing-ino');
    expect(() => planFor([{ name: 'main.ino', source: '' }, { name: 'MAIN.ino', source: '' }])).toThrow('invalid-name');
    expect(() => planFor([{ name: 'main.ino', source: 'x'.repeat(500001) }])).toThrow('limit');
  });
});
describe('bounded interoperable ZIP container', () => {
  it('validates stored CRC32, central directory and UTF-8 with an independent reader', () => {
    const files = [{ path: 'Sketch/Sketch.ino', source: '123456789' }, { path: 'Sketch/data/app.js', source: 'const label = "Niño 🧪";\r\n' }];
    const zipped = textZip(files);
    expect(new DataView(zipped.buffer).getUint32(14, true)).toBe(0xcbf43926);
    expect(extracted(zipped)).toEqual(Object.fromEntries(files.map(file => [file.path, file.source])));
    expect(textZip(files)).toEqual(zipped);
  });
  it.each(['/main/x.ino', 'main/../x.ino', 'main//x.ino', 'main/CON.h', 'main/C:\\x', 'main/%2e%2e/x', 'main./x.ino'])('blocks ZIP path %s', path => {
    expect(() => textZip([{ path, source: '' }])).toThrow('zip-path');
  });
  it('bounds memory use and prevents duplicate extraction paths', () => {
    expect(() => textZip([{ path: 'main/a.h', source: '' }, { path: 'main/A.h', source: '' }])).toThrow('zip-duplicate');
    expect(() => textZip(Array.from({ length: 65 }, (_, index) => ({ path: `main/a${index}.h`, source: '' })))).toThrow('zip-limit');
    expect(() => textZip([{ path: 'main/main.ino', source: 'x'.repeat(1000001) }])).toThrow('zip-limit');
  });
});
