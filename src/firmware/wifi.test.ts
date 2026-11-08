import { describe, expect, it } from 'vitest';
import { compileArduinoSubset } from './compiler';
import { advanceArduino, initialExecution } from './machine';
import { requestFirmwareHttp } from './http';
import { beginWifi, EMULATED_IP, initialWifi, WL_CONNECTED, WL_CONNECT_FAILED, WL_DISCONNECTED } from './wifi';
const execute = (setup: string, globals = '') => advanceArduino(initialExecution(compileArduinoSubset(`#include <ESP8266WiFi.h>\n${globals}\nvoid setup(){${setup}} void loop(){}`, 'esp8266')), 0).execution;

describe('code-driven emulated WiFi', () => {
  it.each([['MiCasa', 'carlos'], ['A different SSID', 'A different password'], [' ñ ', ' 密碼 ']])('accepts arbitrary nonblank credentials %s without retaining the password in connection metadata', (ssid, password) => {
    expect(beginWifi(ssid, password)).toEqual({ status: WL_CONNECTED, ssid, ip: EMULATED_IP });
    expect(Object.keys(beginWifi(ssid, password))).toEqual(['status', 'ssid', 'ip']);
  });
  it.each([['', 'pw'], ['ssid', ''], ['   ', 'pw'], ['ssid', ' \t\n'], ['', '']])('fails for blank or whitespace credentials [%j, %j]', (ssid, password) => {
    expect(beginWifi(ssid, password)).toEqual({ status: WL_CONNECT_FAILED, ssid: null, ip: null });
  });
  it('starts disconnected and executes the exact requested const char* / Serial / localIP subset', () => {
    expect(execute('').wifi).toEqual(initialWifi());
    const execution = execute(`Serial.begin(115200);WiFi.begin(ssid,password);if(WiFi.status()==WL_CONNECTED){Serial.println("WiFi conectado");Serial.println(WiFi.localIP());}`, 'const char* ssid="MiCasa";const char* password="carlos";');
    expect(execution.wifi.status).toBe(WL_CONNECTED);
    expect(execution.serial).toMatchObject({ baudRate: 115200, output: 'WiFi conectado\r\n192.0.2.10\r\n' });
    expect(execution.serial.output).not.toContain('carlos');
  });
  it('does not return an IP while disconnected or bypass Serial.begin', () => {
    expect(() => execute('Serial.begin(9600);Serial.println(WiFi.localIP());')).toThrowError(expect.objectContaining({ code: 'wifi-disconnected' }));
    expect(execute('WiFi.begin("network","pw");Serial.println(WiFi.localIP());').serial.output).toBe('');
  });
  it('disconnects, reconnects, respects status constants, and resets on a fresh execution', () => {
    const execution = execute('WiFi.begin("A","x");WiFi.disconnect();if(WiFi.status()==WL_DISCONNECTED){WiFi.begin("B","y");}');
    expect(execution.wifi).toEqual({ status: WL_CONNECTED, ssid: 'B', ip: EMULATED_IP });
    expect(execute('WiFi.begin("A","x");WiFi.disconnect();').wifi.status).toBe(WL_DISCONNECTED);
    expect(execute('').wifi.status).toBe(WL_DISCONNECTED);
  });
  it('supports two-argument routes and text-variable HTML responses only when firmware connects and starts the server', () => {
    const source = `#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
const char* html="<h1>Program response</h1>";
ESP8266WebServer app(80);
void root(){app.send(200,"text/html",html);}
void setup(){WiFi.begin("fictional","invented");app.on("/",root);app.begin();}
void loop(){app.handleClient();}`;
    const files = [{ name: 'main.ino', source }];
    const program = compileArduinoSubset(source, 'esp8266');
    expect(requestFirmwareHttp(initialExecution(program), files, '/').response.status).toBe(503);
    const execution = advanceArduino(initialExecution(program), 0).execution;
    expect(requestFirmwareHttp(execution, files, '/').response).toEqual({ status: 200, contentType: 'text/html', body: '<h1>Program response</h1>' });
    for (const without of [source.replace('WiFi.begin("fictional","invented");', ''), source.replace('app.begin();', ''), source.replace('app.handleClient();', '')]) {
      const inactive = advanceArduino(initialExecution(compileArduinoSubset(without, 'esp8266')), 0).execution;
      expect(requestFirmwareHttp(inactive, files, '/').response.status).toBe(503);
    }
  });
});
