import { describe, expect, it } from 'vitest';
import { i2cLcdFixture } from '../../test/lcdFixture';
import { initialSimulation, transitionSimulation } from './runtime';
import { parseProject, serializeProject } from '../../model/project';
import { initialLcd, lcdLines } from '../../sim/hd44780';
import { pcfLcdByte, pcfLcdPulses } from '../../sim/pcf8574';
import type { CircuitProject } from '../../model/types';
import { createComponent } from '../../model/components';
import { ownInput } from '../../sim/topology';

const source = '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27,16,2);void setup(){Wire.begin();lcd.init();lcd.backlight();lcd.print("I2C LCD");lcd.setCursor(0,1);lcd.write(65);}void loop(){delay(1000);}';
const run = (project: CircuitProject, sketch = source) => transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source: sketch }, project);
describe('PCF8574 addressed transport into the shared HD44780 controller', () => {
  it('supports imported component IDs that also exist on Object.prototype', () => {
    const project = i2cLcdFixture();
    const rename = (id: string) => id === 'lcd' ? 'constructor' : id === 'adapter' ? '__proto__' : id;
    for (const part of project.components) part.id = rename(part.id);
    for (const wire of project.wires) { wire.from.componentId = rename(wire.from.componentId); wire.to.componentId = rename(wire.to.componentId); }
    const state = run(project);
    expect(state.firmware.uno?.error).toBeNull();
    expect(ownInput(state.snapshot?.components, 'constructor')?.lcd?.lines[0]).toBe('I2C LCD         ');
    expect(Object.hasOwn(state.inputs.pcf8574 ?? {}, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(state.inputs.pcf8574)).toBe(Object.prototype);
  });
  it('decodes P0/P2/P4–P7 on falling E, including two nibbles per byte', () => {
    let controller = initialLcd(), latch = 0;
    // 0x41 = A: RS=1, high nibble=4, low nibble=1; backlight bit=8.
    expect(pcfLcdPulses(65, true, true)).toEqual([0x49,0x4d,0x49,0x19,0x1d,0x19]);
    for (const byte of pcfLcdPulses(65, true, true)) { controller = pcfLcdByte(controller, latch, byte); latch = byte; }
    expect(lcdLines(controller, { columns: 16, rows: 2 })[0]).toBe('A               ');
    expect(pcfLcdByte(controller, 4, 2)).toBe(controller); // RW=1: no write.
  });
  it('reads actual 4-wire I²C and 16 solder-pad connections, with a solved backlight load and contrast divider', () => {
    const project = i2cLcdFixture(), state = run(project), view = state.snapshot?.components.lcd?.lcd;
    expect(state.firmware.uno?.error).toBeNull();
    expect(view?.lines).toEqual(['I2C LCD         ','A               ']);
    expect(view).toMatchObject({ powered: true, connection: 'i2c' });
    expect(view?.backlight).toBeCloseTo((2 / 220) / .02, 10);
    expect(view?.contrast).toBeCloseTo(.5, 10);
    expect(parseProject(serializeProject(project))).toEqual(project);
  });
  it('accepts the UNO SDA/SCL aliases and configurable PCF8574A address 0x3F', () => {
    const project = i2cLcdFixture();
    project.components = project.components.map((part) => part.kind === 'pcf8574' ? { ...part, properties: { ...part.properties, address: 0x3f } } : part);
    for (const wire of project.wires) if (wire.id === 'sda') wire.from.pinId = 'SDA'; else if (wire.id === 'scl') wire.from.pinId = 'SCL';
    expect(run(project, source.replace('0x27','0x3F')).snapshot?.components.lcd?.lcd?.lines[0]).toBe('I2C LCD         ');
  });
  it.each(['vcc','ground','sda','scl','pad-RS','pad-E','pad-D4','pad-D5','pad-D6','pad-D7','pad-RW'])('does not display text with missing %s', (id) => {
    const project = i2cLcdFixture(); project.wires = project.wires.filter((wire) => wire.id !== id);
    expect(run(project).snapshot?.components.lcd?.lcd?.lines).toEqual([' '.repeat(16), ' '.repeat(16)]);
  });
  it('rejects wrong address, swapped SDA/SCL, swapped data pads and duplicate address collisions', () => {
    let project = i2cLcdFixture();
    expect(run(project, source.replace('0x27','0x3F')).inputs.lcd).toBeUndefined();
    for (const wire of project.wires) if (wire.id === 'sda') wire.from.pinId = 'A5'; else if (wire.id === 'scl') wire.from.pinId = 'A4';
    expect(run(project).inputs.lcd).toBeUndefined();
    project = i2cLcdFixture();
    for (const wire of project.wires) if (wire.id === 'pad-D4') wire.to.pinId = 'D5'; else if (wire.id === 'pad-D5') wire.to.pinId = 'D4';
    expect(run(project).inputs.lcd).toBeUndefined();
    project = i2cLcdFixture(); project.components.push(createComponent('pcf8574', { x: 400, y: 300 }, 'second'));
    for (const pin of ['SDA','SCL','VCC','GND']) project.wires.push({ id: `second-${pin}`, from: { componentId: 'adapter', pinId: pin }, to: { componentId: 'second', pinId: pin }, color: '#668c75', waypoints: [] });
    expect(run(project).inputs.lcd).toBeUndefined();
  });
  it('switches the electrical backlight without clearing LCD memory, and supports I²C 20x4', () => {
    const project = i2cLcdFixture();
    const dark = run(project, source.replace('lcd.write(65);', 'lcd.write(65);lcd.noBacklight();'));
    expect(dark.snapshot?.components.lcd?.lcd?.lines[0]).toBe('I2C LCD         ');
    expect(dark.snapshot?.components.lcd?.lcd?.backlight).toBe(0);
    project.components = project.components.map((part) => part.kind === 'lcd-16x2' ? { ...part, kind: 'lcd-20x4' } : part);
    const large = run(project, source.replace('0x27,16,2','0x27,20,4').replace('lcd.write(65);','lcd.setCursor(0,3);lcd.print("Fourth row");'));
    expect(large.snapshot?.components.lcd?.lcd?.lines[3]).toBe('Fourth row          ');
  });
  it('clears through I²C and keeps backlight continuity separate from LCD logic', () => {
    const project = i2cLcdFixture();
    const cleared = run(project, source.replace('lcd.write(65);', 'lcd.clear();lcd.print("Clear");'));
    expect(cleared.snapshot?.components.lcd?.lcd?.lines).toEqual(['Clear           ', ' '.repeat(16)]);
    for (const pin of ['A','K']) {
      const unplugged = { ...project, wires: project.wires.filter((wire) => wire.id !== `pad-${pin}`) };
      const view = run(unplugged).snapshot?.components.lcd?.lcd;
      expect(view?.backlight).toBe(0);
      expect(view?.lines[0]).toBe('I2C LCD         ');
    }
  });
  it('rejects a driven I²C line after init and hides text with an unconnected contrast terminal', () => {
    const project = i2cLcdFixture();
    const driven = run(project, source.replace('lcd.backlight();', 'pinMode(A4,OUTPUT);digitalWrite(A4,LOW);lcd.backlight();'));
    expect(driven.snapshot?.components.lcd?.lcd?.lines).toEqual([' '.repeat(16), ' '.repeat(16)]);
    const floatingContrast = { ...project, wires: project.wires.filter((wire) => wire.id !== 'pad-VO') };
    expect(run(floatingContrast).snapshot?.components.lcd?.lcd?.contrast).toBe(0);
  });
});
