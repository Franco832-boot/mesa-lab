import type { BoardKind, BoardProgram } from '../../model/types';
import { MAX_PROGRAM_FILES, MAX_PROGRAM_SOURCE_LENGTH, sourceFiles, validSourceName } from '../../model/programFiles';
import { analyzeSource } from './sourceAnalysis';
import { reservedFileName } from './zip';
import type { ZipTextFile } from './zip';
import { exportReadme } from './readme';
export type ExportLocale = 'es' | 'en';
export type ExportWarningKind = 'credentials' | 'exclusive-api' | 'missing-local' | 'web-omitted' | 'board-library' | 'ide-name' | 'multiple-ino';
export interface ExportWarning { kind: ExportWarningKind; details: string[] }
export interface CodeExportPlan {
  board: BoardKind;
  folder: string;
  main: string;
  downloadName: string;
  files: ZipTextFile[];
  headers: string[];
  littleFS: boolean;
  warnings: ExportWarning[];
}
export type CodeExportErrorCode = 'empty' | 'missing-ino' | 'invalid-name' | 'limit';
export class CodeExportError extends Error {
  constructor(readonly code: CodeExportErrorCode) { super(code); }
}
export const isCppFile = (name: string) => /\.(ino|h|cpp)$/.test(name);
const coreHeaders = new Set(['Arduino.h', 'Wire.h', 'SPI.h', 'EEPROM.h', 'SoftwareSerial.h', 'stdint.h', 'stdlib.h', 'stdio.h', 'string.h', 'math.h']);
const espHeaders = new Set(['ESP8266WiFi.h', 'ESP8266WebServer.h', 'LittleFS.h', 'FS.h']);
export function defaultMainFile(program: BoardProgram | undefined): string {
  const files = sourceFiles(program);
  return files.find(file => file.name === 'main.ino')?.name ?? files.find(file => file.name.endsWith('.ino'))?.name ?? '';
}
function downloadBase(value: string): string {
  const base = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return base && !reservedFileName(base) ? base : 'sketch';
}
export function prepareCodeExport({ program, board, projectName, locale, main = defaultMainFile(program) }: {
  program: BoardProgram | undefined; board: BoardKind; projectName: string; locale: ExportLocale; main?: string;
}): CodeExportPlan {
  if (!program) throw new CodeExportError('empty');
  const files = sourceFiles(program);
  if (files.length > MAX_PROGRAM_FILES || files.reduce((sum, file) => sum + file.source.length, 0) > MAX_PROGRAM_SOURCE_LENGTH) throw new CodeExportError('limit');
  const known = new Set<string>();
  for (const file of files) {
    if (!validSourceName(file.name) || reservedFileName(file.name) || known.has(file.name.toLowerCase())) throw new CodeExportError('invalid-name');
    known.add(file.name.toLowerCase());
  }
  if (!main.endsWith('.ino') || !files.some(file => file.name === main)) throw new CodeExportError('missing-ino');
  const folder = main.slice(0, -4);
  if (main.length > 63 || !folder || folder.endsWith('.') || reservedFileName(folder)) throw new CodeExportError('invalid-name');
  const cpp = files.filter(file => isCppFile(file.name));
  const analyzed = cpp.map(file => ({ file, scan: analyzeSource(file.source) }));
  const includes = analyzed.flatMap(item => item.scan.includes);
  const littleFS = analyzed.some(item => item.scan.littleFS);
  const headers = [...new Set(includes.filter(header => !files.some(file => file.name === header.name)).map(header => header.name))].sort();
  const warnings: ExportWarning[] = [];
  const warn = (kind: ExportWarningKind, details: string[]) => { if (details.length) warnings.push({ kind, details: [...new Set(details)] }); };
  warn('credentials', analyzed.filter(item => item.scan.credentials).map(item => item.file.name));
  warn('exclusive-api', analyzed.flatMap(item => item.scan.exclusive.map(symbol => `${item.file.name}: ${symbol}`)));
  warn('missing-local', includes.filter(header => header.local && !files.some(file => file.name === header.name) && !coreHeaders.has(header.name) && !(board === 'esp8266' && espHeaders.has(header.name))).map(header => header.name));
  warn('board-library', board === 'arduino-uno' ? headers.filter(header => espHeaders.has(header)) : []);
  const web = files.filter(file => !isCppFile(file.name));
  warn('web-omitted', littleFS ? [] : web.map(file => file.name));
  warn('ide-name', cpp.filter(file => file.name.length > 63).map(file => file.name));
  warn('multiple-ino', cpp.filter(file => file.name.endsWith('.ino')).length > 1 ? cpp.filter(file => file.name.endsWith('.ino')).map(file => file.name) : []);
  const plan: CodeExportPlan = {
    board, folder, main, downloadName: `${downloadBase(projectName)}-${board}.zip`, headers, littleFS, warnings,
    files: [...cpp.map(file => ({ path: `${folder}/${file.name}`, source: file.source })),
      ...(littleFS ? web.map(file => ({ path: `${folder}/data/${file.name}`, source: file.source })) : [])],
  };
  plan.files.push({ path: `${folder}/README.md`, source: exportReadme(plan, locale) });
  return plan;
}
