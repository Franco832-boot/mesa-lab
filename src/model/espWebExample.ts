import main from '../../examples/esp8266/web-led/main.ino?raw';
import functionsHeader from '../../examples/esp8266/web-led/Funciones.h?raw';
import functions from '../../examples/esp8266/web-led/Funciones.cpp?raw';
import serverHeader from '../../examples/esp8266/web-led/Servidor.h?raw';
import server from '../../examples/esp8266/web-led/Servidor.cpp?raw';
import html from '../../examples/esp8266/web-led/index.html?raw';
import css from '../../examples/esp8266/web-led/style.css?raw';
import js from '../../examples/esp8266/web-led/app.js?raw';
import type { SourceFile } from './types';

export function espWebExampleFiles(): SourceFile[] {
  return [
    { name: 'main.ino', source: main },
    { name: 'Funciones.h', source: functionsHeader }, { name: 'Funciones.cpp', source: functions },
    { name: 'Servidor.h', source: serverHeader }, { name: 'Servidor.cpp', source: server },
    { name: 'index.html', source: html }, { name: 'style.css', source: css }, { name: 'app.js', source: js },
  ];
}
