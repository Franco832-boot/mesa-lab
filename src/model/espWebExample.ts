import wifiHeader from '../../examples/esp8266/web-led/wifi.h?raw';
import wifi from '../../examples/esp8266/web-led/wifi.cpp?raw';
import main from '../../examples/esp8266/web-led/main.ino?raw';
import functionsHeader from '../../examples/esp8266/web-led/funciones.h?raw';
import functions from '../../examples/esp8266/web-led/funciones.cpp?raw';
import serverHeader from '../../examples/esp8266/web-led/servidor.h?raw';
import server from '../../examples/esp8266/web-led/servidor.cpp?raw';
import html from '../../examples/esp8266/web-led/index.html?raw';
import css from '../../examples/esp8266/web-led/style.css?raw';
import js from '../../examples/esp8266/web-led/app.js?raw';
import type { SourceFile } from './types';

export function espWebExampleFiles(): SourceFile[] {
  return [
    { name: 'main.ino', source: main },
    { name: 'wifi.h', source: wifiHeader }, { name: 'wifi.cpp', source: wifi },
    { name: 'funciones.h', source: functionsHeader }, { name: 'funciones.cpp', source: functions },
    { name: 'servidor.h', source: serverHeader }, { name: 'servidor.cpp', source: server },
    { name: 'index.html', source: html }, { name: 'style.css', source: css }, { name: 'app.js', source: js },
  ];
}
