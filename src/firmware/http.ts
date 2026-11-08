import { WL_CONNECTED } from './wifi';
import type { SourceFile } from '../model/types';
import { fail, MAX_ADVANCE_STEPS } from './errors';
import { advanceArduino, type UnoExecution } from './machine';
import type { FirmwareHost } from './ports';

import type { HttpResponse } from './httpTypes';
export type { HttpResponse } from './httpTypes';
import { localHttpPath } from './httpTypes';
export { localHttpPath } from './httpTypes';
const response = (status: number): HttpResponse => ({ status, contentType: 'text/plain', body: String(status) });
const types: Readonly<Record<string, string>> = { html: 'text/html', css: 'text/css', js: 'text/javascript' };

export function requestFirmwareHttp(execution: UnoExecution, files: readonly SourceFile[], path: string, host?: FirmwareHost) {
  const unavailable = { execution, gpio: [], response: response(503) };
  if (execution.wifi.status !== WL_CONNECTED) return unavailable;
  if (!localHttpPath(path)) return { ...unavailable, response: response(400) };
  const entry = Object.entries(execution.http.servers).find(([, server]) => server.began && server.polling);
  if (!entry) return unavailable;
  const [name, server] = entry;
  const route = Object.hasOwn(server.routes, path) ? server.routes[path] : undefined;
  if (!route) return { ...unavailable, response: response(404) };
  if ('file' in route) {
    const file = execution.http.fs ? files.find((item) => `/${item.name}` === route.file) : undefined;
    return { ...unavailable, response: file ? { status: 200, contentType: types[file.name.split('.').at(-1) ?? ''] ?? 'text/plain', body: file.source } : response(404) };
  }
  // Callbacks use the same bytecode, globals, peripherals and GPIO instructions.
  // A handler is atomic and bounded; a delay or exhausted budget rolls it back.
  const pc = execution.program.functionPcs.get(route.handler) ?? fail('name-error');
  const callback: UnoExecution = { ...execution, resources: files, pc, scopes: [execution.scopes[0] ?? new Map()], texts: [execution.texts[0] ?? new Map()], operands: [], textOperands: [],
    frames: [{ pc: -1, scopeDepth: 1, operandDepth: 0, textDepth: 0 }], wakeAtUs: null, wakeAt: null, wakeReason: null, pendingUntilUs: null,
    http: { ...execution.http, requestServer: name, response: null } };
  const result = advanceArduino(callback, 0, MAX_ADVANCE_STEPS, host);
  if (result.execution.pc !== -1 || !result.execution.http.response) fail('http-handler-limit');
  return { execution: { ...result.execution, pc: execution.pc, scopes: [result.execution.scopes[0] ?? new Map(), ...execution.scopes.slice(1)],
    texts: [result.execution.texts[0] ?? new Map(), ...execution.texts.slice(1)], textOperands: execution.textOperands,
    operands: execution.operands, frames: execution.frames, phase: execution.phase, loopWaited: execution.loopWaited,
    wakeAtUs: execution.wakeAtUs, wakeAt: execution.wakeAt, wakeReason: execution.wakeReason, pendingUntilUs: execution.pendingUntilUs,
    http: { ...result.execution.http, requestServer: null, response: null } }, gpio: result.gpio, response: result.execution.http.response };
}
