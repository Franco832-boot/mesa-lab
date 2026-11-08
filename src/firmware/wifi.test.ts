import { describe, expect, it } from 'vitest';
import { compileArduinoSubset } from './compiler';
import { compileProjectFiles } from './projectCompiler';
import { advanceArduino, initialExecution } from './machine';
import { requestFirmwareHttp } from './http';
import { beginWifi, advanceWifi, DEFAULT_WIFI_NETWORK, initialWifi, validWifiNetwork, WL_CONNECTED, WL_CONNECT_FAILED, WL_DISCONNECTED } from './wifi';
const execute = (setup: string, elapsedMs = 400, globals = '') => advanceArduino(initialExecution(compileArduinoSubset(`#include <ESP8266WiFi.h>\n${globals}\nvoid setup(){${setup}} void loop(){}`, 'esp8266')), elapsedMs).execution;

describe('configured virtual WiFi and real linked modules', () => {
  it('uses virtual deadlines and matches the fictional network, never retaining the submitted password in the attempt', () => {
    const pending = beginWifi('MiCasa', 'carlos', 1000);
    expect(pending.status).toBe(0); expect(pending.ip).toBeNull();
    expect(advanceWifi(pending, 300999).status).toBe(0);
    expect(advanceWifi(pending, 301000)).toEqual({ mode: 1, status: 3, ssid: 'MiCasa', ip: '192.0.2.10' });
    expect(JSON.stringify(pending)).not.toContain('carlos');
    expect(advanceWifi(pending, 300999)).toBe(pending);
  });
  it.each([['', 'carlos'], ['MiCasa', ''], ['   ', 'carlos'], ['MiCasa', ' \t\n'], ['MiCasa', 'wrong'], ['Other network', 'carlos']])('rejects absent/mismatched credentials [%j, %j]', (ssid, password) => {
    const attempted = beginWifi(ssid, password);
    expect(attempted.status).toBe(0);
    expect(advanceWifi(attempted, 300000)).toMatchObject({ status: WL_CONNECT_FAILED, ip: null });
  });
  it('supports arbitrary explicitly configured credentials and rejects an unavailable network', () => {
    const network = { ...DEFAULT_WIFI_NETWORK, ssid: 'Classroom', password: 'fictional secret', connectDelayMs: 1000 };
    expect(advanceWifi(beginWifi('Classroom', 'fictional secret', 0, network), 1000000).status).toBe(3);
    expect(advanceWifi(beginWifi('Classroom', 'wrong', 0, network), 1000000).status).toBe(4);
    expect(advanceWifi(beginWifi(network.ssid, network.password, 0, { ...network, available: false }), 1000000).status).toBe(4);
    expect(validWifiNetwork({ ...network, ip: '192.168.1.1' })).toBe(false);
  });
  it('links a custom header/implementation pair with const declarations, void calls and a bool result', () => {
    const files = [
      { name: 'main.ino', source: '#include "Radio.h"\nvoid setup(){Serial.begin(115200);conectarWiFi();if(wifiConectado())Serial.println(WiFi.localIP());}void loop(){}' },
      { name: 'Radio.h', source: '#pragma once\n#include <ESP8266WiFi.h>\nconst unsigned long LIMITE=5000UL;\nvoid conectarWiFi();bool wifiConectado();' },
      { name: 'Custom.cpp', source: '#include "Radio.h"\nconst char* ssid="MiCasa";const char* password="carlos";bool wifiConectado(){return WiFi.status()==WL_CONNECTED;}void conectarWiFi(){WiFi.mode(WIFI_STA);WiFi.begin(ssid,password);const unsigned long inicio=millis();while(!wifiConectado() && millis()-inicio<LIMITE){delay(100);}}' },
    ];
    const program = compileProjectFiles(files, 'esp8266');
    const initial = advanceArduino(initialExecution(program), 0).execution;
    expect(initial.wifi.status).toBe(0); expect(initial.phase).toBe('setup');
    const almost = advanceArduino(initial, 299).execution;
    expect(almost.wifi.status).toBe(0);
    const connected = advanceArduino(almost, 101).execution;
    expect(connected.wifi.status).toBe(WL_CONNECTED);
    expect(connected.serial.output).toBe('192.0.2.10\r\n');
    expect(connected.frames).toHaveLength(0); expect(connected.scopes).toHaveLength(1);
    expect(initial.wifi.status).toBe(0);
  });
  it('polls without delay cooperatively and does not expose an IP before the deadline', () => {
    const source = 'WiFi.mode(WIFI_STA);WiFi.begin("MiCasa","carlos");while(WiFi.status()!=WL_CONNECTED){}Serial.begin(9600);Serial.println(WiFi.localIP());';
    expect(execute(source, 299).wifi.status).toBe(0);
    expect(execute(source, 301).serial.output).toBe('192.0.2.10\r\n');
    expect(() => execute('Serial.begin(9600);Serial.println(WiFi.localIP());', 0)).toThrowError(expect.objectContaining({code:'wifi-disconnected'}));
  });
  it('disconnects/reconnects at virtual times and starts fresh without a retained connection', () => {
    const source = 'WiFi.mode(WIFI_STA);WiFi.begin("MiCasa","carlos");while(WiFi.status()!=WL_CONNECTED){delay(10);}WiFi.disconnect();Serial.begin(9600);Serial.println(WiFi.status());WiFi.begin("MiCasa","carlos");while(WiFi.status()!=WL_CONNECTED){delay(10);}Serial.println(WiFi.localIP());';
    const execution = execute(source, 700);
    expect(execution.serial.output).toBe('6\r\n192.0.2.10\r\n');
    expect(initialWifi().status).toBe(WL_DISCONNECTED); expect(execute('', 0).wifi.ip).toBeNull();
  });
  it('rejects modes and return signatures it does not implement and bounds nonterminating while loops', () => {
    expect(() => execute('WiFi.mode(2);', 0)).toThrowError(expect.objectContaining({code:'invalid-value'}));
    expect(() => compileArduinoSubset('bool f();void f(){}void setup(){}void loop(){}')).toThrowError(expect.objectContaining({code:'type-error'}));
    expect(() => execute('', 0, 'bool missing(){return;}')).toThrowError(expect.objectContaining({code:'type-error'}));
    const state = execute('while(true){}', 100);
    expect(state.phase).toBe('setup'); expect(state.timeUs).toBe(100000); expect(state.wakeReason).toBe('cooperative');
  });
  it('only serves registered routes when both WiFi and the server are ready; disconnect gates future requests', () => {
    const source = `#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
ESP8266WebServer app(80);
void root(){app.send(200,"text/html","<h1>Real response</h1>");}
void off(){WiFi.disconnect();app.send(200,"text/plain","bye");}
void setup(){WiFi.mode(WIFI_STA);WiFi.begin("MiCasa","carlos");while(WiFi.status()!=WL_CONNECTED){delay(10);}app.on("/",root);app.on("/disconnect",off);app.begin();}
void loop(){app.handleClient();}`;
    const files = [{ name:'main.ino', source }], program = compileArduinoSubset(source,'esp8266');
    const connecting = advanceArduino(initialExecution(program),0).execution;
    expect(requestFirmwareHttp(connecting,files,'/').response.status).toBe(503);
    const connected = advanceArduino(connecting,400).execution;
    expect(requestFirmwareHttp(connected,files,'/').response.body).toBe('<h1>Real response</h1>');
    const disconnected = requestFirmwareHttp(connected,files,'/disconnect').execution;
    expect(disconnected.wifi.status).toBe(6); expect(requestFirmwareHttp(disconnected,files,'/').response.status).toBe(503);
  });
});
