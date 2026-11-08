import { describe, expect, it } from 'vitest';
import { compileProjectFiles } from './projectCompiler';
import { initialExecution, advanceArduino } from './machine';
import { requestFirmwareHttp } from './http';
import { espWebExampleFiles } from '../model/espWebExample';
import { UnoExecutionError } from './errors';

const main = 'void setup(){start();} void loop(){}';
describe('project-local linking through the Arduino VM', () => {
  it('links custom .cpp names, prototypes, #pragma once and calls with early returns', () => {
    const program = compileProjectFiles([
      { name: 'main.ino', source: '#include "Helpers.h"\n' + main },
      { name: 'Helpers.h', source: '#pragma once\nvoid start();\nvoid other();' },
      { name: 'Custom.cpp', source: '#include "Helpers.h"\nvoid start(){pinMode(D5,OUTPUT);other();}void other(){digitalWrite(D5,HIGH);return;digitalWrite(D5,LOW);}' },
    ], 'esp8266');
    expect(advanceArduino(initialExecution(program), 0).execution.levels.D5).toBe('HIGH');
  });
  it.each([
    { source: '#include "Missing.h"\n' + main, code: 'missing-file' },
    { source: 'void setup(){unknown();}void loop(){}', code: 'name-error' },
    { source: 'int helper(){return 1;}void setup(){}void loop(){}', code: 'unsupported-syntax' },
    { source: 'void setup(){helper(1);}void loop(){}void helper(){}', code: 'unsupported-syntax' },
  ])('reports $code for unsupported or missing source', ({ source, code }) => {
    expect(() => compileProjectFiles([{ name: 'main.ino', source }], 'esp8266')).toThrowError(expect.objectContaining({ code }));
  });
  it('locates missing includes and cycles in their project file', () => {
    const files = [{ name: 'main.ino', source: '#include "A.h"\nvoid setup(){}void loop(){}' }, { name: 'A.h', source: '#include "B.h"\n' }];
    try { compileProjectFiles(files, 'esp8266'); throw new Error('Expected failure'); }
    catch (error: unknown) {
      expect(error).toBeInstanceOf(UnoExecutionError);
      if (error instanceof UnoExecutionError) expect(error.location?.file).toContain('A.h → B.h');
    }
    files.push({ name: 'B.h', source: '#include "A.h"\n' });
    expect(() => compileProjectFiles(files, 'esp8266')).toThrowError(expect.objectContaining({ code: 'include-cycle' }));
  });
  it('bounds recursive functions in the existing VM', () => {
    const program = compileProjectFiles([{ name: 'main.ino', source: 'void again(){again();}void setup(){again();}void loop(){}' }], 'esp8266');
    expect(() => advanceArduino(initialExecution(program), 0)).toThrowError(expect.objectContaining({ code: 'nesting-limit' }));
  });
});

describe('ESP8266WebServer adapter', () => {
  it('serves only registered resources and calls actual handlers with persistent D5 latch state', () => {
    const files = espWebExampleFiles();
    let execution = advanceArduino(initialExecution(compileProjectFiles(files, 'esp8266')), 0).execution;
    for (const [path, contentType] of [['/', 'text/html'], ['/style.css', 'text/css'], ['/app.js', 'text/javascript']]) {
      expect(requestFirmwareHttp(execution, files, path ?? '').response).toMatchObject({ status: 200, contentType });
    }
    expect(requestFirmwareHttp(execution, files, '/led/state').response.body).toBe('OFF');
    const on = requestFirmwareHttp(execution, files, '/led/on');
    execution = on.execution;
    expect(on.response.body).toBe('ON');
    expect(on.gpio.at(-1)).toMatchObject({ pinId: 'D5', state: { mode: 'output', level: 'HIGH' } });
    expect(requestFirmwareHttp(execution, files, '/led/state').response.body).toBe('ON');
    expect(requestFirmwareHttp(execution, files, '/led/off').execution.levels.D5).toBe('LOW');
    expect(requestFirmwareHttp(execution, files, '/unknown').response.status).toBe(404);
    for (const path of ['http://127.0.0.1/', '//localhost/', '/../main.ino', '/%2e%2e/', '/?x=1']) expect(requestFirmwareHttp(execution, files, path).response.status).toBe(400);
  });
  it('registers arbitrary routes through executed branches and preserves globals across callback calls', () => {
    const source = `#include <ESP8266WebServer.h>
#include <ESP8266WiFi.h>
ESP8266WebServer device(80);
int count = 0;
void report() {
  count++;
  if (digitalRead(D2) == HIGH) device.send(201,"text/plain","active");
  else device.send(200,"text/plain","idle");
}
void power() { digitalWrite(D2,HIGH); report(); }
void setup() {
  WiFi.begin("Any network", "Any password");
  int count = 99;
  pinMode(D2,OUTPUT);
  if (true) device.on("/custom/power",HTTP_GET,power);
  if (false) device.on("/not-registered",HTTP_GET,report);
  device.on("/sample",HTTP_GET,report);
  device.begin();
}
void loop(){ device.handleClient(); }`;
    const files = [{ name: 'main.ino', source }];
    let execution = advanceArduino(initialExecution(compileProjectFiles(files, 'esp8266')), 0).execution;
    expect(requestFirmwareHttp(execution, files, '/not-registered').response.status).toBe(404);
    const result = requestFirmwareHttp(execution, files, '/custom/power');
    execution = result.execution;
    expect(result.response).toMatchObject({ status: 201, body: 'active' });
    expect(execution.scopes[0]?.get('count')?.value?.value).toBe(1);
    const next = requestFirmwareHttp(execution, files, '/sample');
    expect(next.execution.scopes[0]?.get('count')?.value?.value).toBe(2);
    expect(execution.scopes[0]?.get('count')?.value?.value).toBe(1); // Previous state remains immutable.
  });
  it('requires begin and handleClient and rejects handlers that wait', () => {
    const files = espWebExampleFiles();
    const initial = initialExecution(compileProjectFiles(files, 'esp8266'));
    expect(requestFirmwareHttp(initial, files, '/').response.status).toBe(503);
    const waiting = files.map((file) => file.name === 'Servidor.cpp' ? { ...file, source: file.source.replace('encenderLed();', 'encenderLed(); delay(1);') } : file);
    const execution = advanceArduino(initialExecution(compileProjectFiles(waiting, 'esp8266')), 0).execution;
    expect(() => requestFirmwareHttp(execution, waiting, '/led/on')).toThrowError(expect.objectContaining({ code: 'http-handler-limit' }));
    expect(execution.levels.D5).toBe('LOW');
  });
});
