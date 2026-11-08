import { readFileSync } from 'node:fs';
import { component, project, wire } from './fixtures.mjs';
export function webFixture({ pin = 'D5', script, html, css, open = false } = {}) {
  const names = ['main.ino','wifi.h','wifi.cpp','funciones.h','funciones.cpp','servidor.h','servidor.cpp','index.html','style.css','app.js'];
  const files = names.map(name => ({ name, source: readFileSync(new URL(`../../examples/esp8266/web-led/${name}`, import.meta.url), 'utf8').replaceAll('D5', pin) }));
  for (const [name, content] of [['index.html',html],['app.js',script],['style.css',css]]) {
    if (content !== undefined) files.find(file => file.name === name).source = content;
  }
  const document = project([
    component('esp8266','esp',60,60,{logicVoltage:3.3}), component('resistor','r',340,100,{resistance:220}), component('led','led',480,100,{color:'red'}),
  ], [wire('drive','esp',pin,'r','1'), wire('load','r','2','led','anode'), ...(open ? [] : [wire('return','led','cathode','esp','GND')])]);
  document.programs = [{ componentId:'esp', language:'arduino-cpp', execution:'unavailable', source:files[0].source, files, activeFile:'main.ino' }];
  return document;
}
export async function startWeb(page) {
  await page.getByTestId('simulation-start').click();
  await page.getByTestId('esp-code-tab-web').waitFor();
  await page.getByTestId('esp-web-frame').waitFor();
  return page.frameLocator('[data-testid="esp-web-frame"]');
}
export async function editWebFile(page, name, value) {
  await page.getByTestId('simulation-stop').click();
  await page.getByTestId('esp-code-tab-html').click();
  await page.locator('#tool-panel-code').getByRole('tab', { name, exact:true }).click();
  await page.getByTestId('board-code-editor').fill(value);
}
