import { describe, expect, it } from 'vitest';
import { parallelLcdFixture } from '../../test/lcdFixture';
import { initialSimulation, transitionSimulation } from './runtime';
import { nextFirmwareDelay } from './firmwareRuntime';
import type { SimulationState } from './runtime';
import type { CircuitProject } from '../../model/types';
import { createComponent } from '../../model/components';
import { serializeProject } from '../../model/project';

const source = '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){lcd.begin(16,2);lcd.print("Mesa Lab");lcd.setCursor(0,1);lcd.print(42);}void loop(){delay(1000);}';
function run(project: CircuitProject, sketch = source) { return transitionSimulation(initialSimulation(), { type: 'firmware-run', componentId: 'uno', source: sketch }, project); }
function advance(state: SimulationState, project: CircuitProject, elapsedMs: number) {
  let next = transitionSimulation(state, { type: 'firmware-advance', elapsedMs }, project);
  for (let count = 0; nextFirmwareDelay(next) === 0; count++) {
    if (count > 10000) throw new Error('Unexpected unfinished slice');
    next = transitionSimulation(next, { type: 'firmware-advance', elapsedMs: 0 }, project);
  }
  return next;
}
describe('LiquidCrystal writes through a physically validated parallel bus', () => {
  it('uses the same parallel transport and controller for the four physical rows of a 20x4 module', () => {
    const project = parallelLcdFixture();
    project.components = project.components.map((part) => part.kind === 'lcd-16x2' ? { ...part, kind: 'lcd-20x4' } : part);
    const sketch = source.replace('begin(16,2)', 'begin(20,4)').replace('lcd.print(42);', 'lcd.print(42);lcd.setCursor(0,2);lcd.print("Row 3");lcd.setCursor(19,3);lcd.write(90);');
    const view = run(project, sketch).snapshot?.components.lcd?.lcd;
    expect(view?.lines).toEqual(['Mesa Lab            ','42                  ','Row 3               ','                   Z']);
  });
  it('executes the constructor, begin, text and numeric print against the real circuit', () => {
    const project = parallelLcdFixture(), before = serializeProject(project), state = run(project);
    expect(state.firmware.uno?.error).toBeNull();
    expect(state.snapshot?.components.lcd?.lcd?.lines).toEqual(['Mesa Lab        ','42              ']);
    expect(state.snapshot?.components.lcd?.lcd?.connection).toBe('parallel');
    expect(serializeProject(project)).toBe(before);
    expect(transitionSimulation(state, { type: 'reset' }, project)).toEqual(initialSimulation());
  });
  it.each(['RS','E','D4','D5','D6','D7','rw','supply','ground'])('does not accept writes when %s is disconnected', (id) => {
    const project = parallelLcdFixture(); project.wires = project.wires.filter((wire) => wire.id !== id);
    expect(run(project).snapshot?.components.lcd?.lcd?.lines).toEqual([' '.repeat(16), ' '.repeat(16)]);
  });
  it('rejects swapped pins, mismatched code and DATA shorts rather than displaying recognized print text', () => {
    const swapped = parallelLcdFixture();
    for (const wire of swapped.wires) { if (wire.id === 'D4') wire.from.pinId = 'D4'; if (wire.id === 'D5') wire.from.pinId = 'D5'; }
    expect(run(swapped).inputs.lcd).toBeUndefined();
    const project = parallelLcdFixture();
    expect(run(project, source.replace('12,11,5,4,3,2', '13,11,5,4,3,2')).inputs.lcd).toBeUndefined();
    project.wires.push({ id: 'short', from: { componentId: 'lcd', pinId: 'D4' }, to: { componentId: 'lcd', pinId: 'VSS' }, color: '#668c75', waypoints: [] });
    expect(run(project).inputs.lcd).toBeUndefined();
  });
  it('respects GPIO mode changes after begin and prevents another unwired board from modifying its controller', () => {
    const project = parallelLcdFixture();
    expect(run(project, source.replace('lcd.print("Mesa Lab");', 'pinMode(12,INPUT);lcd.print("Mesa Lab");')).inputs.lcd?.lcd?.memory).toEqual(Array(80).fill(32));
    const state = run(project);
    project.components.push(createComponent('arduino-uno', { x: 0, y: 300 }, 'other'));
    const second = transitionSimulation(state, { type: 'firmware-run', componentId: 'other', source }, project);
    expect(second.inputs.lcd?.lcd).toEqual(state.inputs.lcd?.lcd);
    expect(second.firmware.other?.error).toBeNull();
  });
  it('retains hidden DDRAM across display off/on, supports cursor flags, write and timed clear', () => {
    const project = parallelLcdFixture();
    const sketch = '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12,11,5,4,3,2);void setup(){lcd.begin(16,2);lcd.write(65);lcd.cursor();lcd.blink();lcd.noDisplay();delay(100);lcd.display();lcd.noBlink();lcd.home();delay(100);lcd.clear();lcd.noCursor();}void loop(){delay(1000);}';
    let state = run(project, sketch);
    expect(state.snapshot?.components.lcd?.lcd?.lines[0]).toBe(' '.repeat(16));
    state = advance(state, project, 100);
    expect(state.snapshot?.components.lcd?.lcd).toMatchObject({ lines: ['A               ','                '], cursor: true, blink: false, cursorColumn: 0 });
    state = advance(state, project, 100);
    expect(state.snapshot?.components.lcd?.lcd).toMatchObject({ lines: [' '.repeat(16),' '.repeat(16)], cursor: false });
  });
  it('solves external backlight current independently and rejects wrong supply voltage', () => {
    const project = parallelLcdFixture();
    project.components.push({ ...createComponent('resistor', { x: 500, y: 200 }, 'backlight-r'), kind: 'resistor', properties: { resistance: 220 } });
    const wire = (id: string, a: string, pa: string, b: string, pb: string) => ({ id, from: { componentId: a, pinId: pa }, to: { componentId: b, pinId: pb }, color: '#668c75', waypoints: [] });
    project.wires.push(wire('ba','uno','5V','backlight-r','1'), wire('bb','backlight-r','2','lcd','A'), wire('bk','uno','GND','lcd','K'));
    expect(run(project).snapshot?.components.lcd?.lcd?.backlight).toBeCloseTo((2 / 220) / .02, 10);
    project.wires = project.wires.map((connection) => connection.id === 'supply' ? { ...connection, from: { componentId: 'uno', pinId: '3V3' } } : connection);
    expect(run(project).snapshot?.components.lcd?.lcd?.powered).toBe(false);
  });
});
