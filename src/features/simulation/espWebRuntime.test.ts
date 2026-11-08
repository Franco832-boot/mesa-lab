import { projectReducer, projectReplaced, editorCommandApplied, undoApplied, redoApplied } from '../project/projectSlice';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/exampleProjects';
import { parseProject, serializeProject } from '../../model/project';
import { applyEditorCommand } from '../../model/editor';
import { pinKey } from '../../sim/topology';
import { initialSimulation, transitionSimulation, reconcileSimulationProject, simulationProjectStamp } from './runtime';
import { createComponent } from '../../model/components';

const fixture = () => createExampleProject('esp-web-led', 'Web LED', 'web-test');
const run = { type: 'firmware-run' as const, componentId: 'esp' };
const http = (path: string, componentId = 'esp') => ({ type: 'firmware-http' as const, componentId, path });
describe('ESP8266 code → HTTP → GPIO14 → existing electrical solver', () => {
  it('calculates current independently and reports state from D5, with stop/pause/reset protection', () => {
    const project = fixture(), before = serializeProject(project);
    let state = transitionSimulation(initialSimulation(), { ...run, source: project.programs[0]?.source ?? '' }, project);
    expect(state.firmware.esp?.error).toBeNull();
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    state = transitionSimulation(state, http('/led/on'), project);
    expect(state.firmware.esp?.httpResponse?.body).toBe('ON');
    expect(state.inputs.gpio?.[pinKey('esp', 'D5')]).toEqual({ mode: 'output', level: 'HIGH' });
    // Red LED Vf = 2 V; ESP 3.3 V, finite 50 Ω output and 220 Ω resistor.
    expect(state.snapshot?.components.led?.current).toBeCloseTo((3.3 - 2) / (220 + 50), 10);
    expect(state.snapshot?.components.led?.brightness).toBeCloseTo(((3.3 - 2) / 270) / .02, 10);
    expect(state.snapshot?.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    state = transitionSimulation(state, http('/led/state'), project);
    expect(state.firmware.esp?.httpResponse?.body).toBe('ON');
    state = transitionSimulation(state, { type: 'pause' }, project);
    const gpio = state.inputs.gpio;
    state = transitionSimulation(state, http('/led/off'), project);
    expect(state.firmware.esp?.httpResponse?.status).toBe(503);
    expect(state.inputs.gpio).toBe(gpio);
    state = transitionSimulation(state, { type: 'start' }, project);
    state = transitionSimulation(state, http('/led/off'), project);
    expect(state.snapshot?.components.led?.current).toBe(0);
    state = transitionSimulation(state, { type: 'stop' }, project);
    expect(transitionSimulation(state, http('/led/on'), project)).toEqual(initialSimulation());
    expect(serializeProject(project)).toBe(before);
    expect(parseProject(before)).toEqual(project);
  });
  it.each(['missing-return', 'reversed'] as const)('keeps the physical LED dark for %s without inventing an indeterminate pin reading', (fault) => {
    const project = fixture();
    if (fault === 'missing-return') project.wires = project.wires.filter((wire) => wire.id !== 'led-ground');
    else {
      const led = project.components.find((component) => component.id === 'led');
      if (!led?.attachments) throw new Error('Missing LED contacts');
      led.attachments = led.attachments.map((attachment) => ({ ...attachment, pinId: attachment.pinId === 'anode' ? 'cathode' : 'anode' }));
    }
    let state = transitionSimulation(initialSimulation(), { ...run, source: project.programs[0]?.source ?? '' }, project);
    state = transitionSimulation(state, http('/led/on'), project);
    if (fault === 'missing-return') {
      expect(state.firmware.esp?.httpResponse?.status).toBe(200);
      expect(state.inputs.gpio?.[pinKey('esp', 'D5')]?.level).toBe('HIGH');
    } else {
      expect(state.firmware.esp?.httpResponse?.status).toBe(500);
      expect(state.firmware.esp?.error).toBe('indeterminate-read');
    }
    expect(state.snapshot?.components.led?.brightness).toBe(0);
  });
  it('keeps compiled resources as a run snapshot; project edits apply on restart and stay portable', () => {
    const project = fixture();
    const source = project.programs[0]?.source ?? '';
    let state = transitionSimulation(initialSimulation(), { ...run, source }, project);
    const edited = applyEditorCommand(project, { type: 'program-file', id: 'esp', action: { type: 'edit', name: 'style.css', source: 'body{color:red}' } });
    state = transitionSimulation(state, http('/style.css'), edited);
    expect(state.firmware.esp?.httpResponse?.body).not.toBe('body{color:red}');
    state = transitionSimulation(state, { ...run, source }, parseProject(serializeProject(edited)));
    state = transitionSimulation(state, http('/style.css'), edited);
    expect(state.firmware.esp?.httpResponse?.body).toBe('body{color:red}');
    expect(reconcileSimulationProject(state, simulationProjectStamp(edited), { ...edited, id: 'replacement' })).toEqual(initialSimulation());
  });
  it('undoes and redoes a linked handler edit in the authoritative Redux document', () => {
    const project = fixture();
    const implementation = project.programs[0]?.files?.find((file) => file.name === 'Funciones.cpp')?.source;
    if (!implementation) throw new Error('Missing helper');
    const initial = projectReducer(undefined, projectReplaced(project));
    const changed = projectReducer(initial, editorCommandApplied({ type: 'program-file', id: 'esp', action: {
      type: 'edit', name: 'Funciones.cpp', source: implementation.replace('digitalWrite(D5, HIGH)', 'digitalWrite(D5, LOW)'),
    } }));
    const reverted = projectReducer(changed, undoApplied());
    const reapplied = projectReducer(reverted, redoApplied());
    expect(reverted.document).toEqual(project);
    expect(reapplied.document).toEqual(changed.document);
    for (const [document, expected] of [[reverted.document, 'ON'], [reapplied.document, 'OFF']] as const) {
      const saved = parseProject(serializeProject(document));
      let state = transitionSimulation(initialSimulation(), { ...run, source: saved.programs[0]?.source ?? '' }, saved);
      state = transitionSimulation(state, http('/led/on'), saved);
      expect(state.firmware.esp?.httpResponse?.body).toBe(expected);
    }
  });
  it('reports the solved LOW pin when D5 is grounded despite the firmware HIGH output latch', () => {
    const project = fixture();
    project.wires.push({ id: 'grounded-d5', from: { componentId: 'esp', pinId: 'D5' }, to: { componentId: 'esp', pinId: 'GND' }, color: '#525b69', waypoints: [] });
    let state = transitionSimulation(initialSimulation(), { ...run, source: project.programs[0]?.source ?? '' }, project);
    state = transitionSimulation(state, http('/led/on'), project);
    expect(state.firmware.esp?.execution?.levels.D5).toBe('HIGH');
    expect(state.firmware.esp?.httpResponse?.body).toBe('OFF');
    expect(state.snapshot?.pins[pinKey('esp', 'D5')]?.logic).toBe('LOW');
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    expect(state.snapshot?.diagnostics).toContainEqual({ code: 'gpio-overcurrent', severity: 'warning', componentIds: ['esp'], pinIds: ['D5'] });
  });
  it('rejects the previous execution session even after the same board is restarted', () => {
    const project = fixture(), source = project.programs[0]?.source ?? '';
    let state = transitionSimulation(initialSimulation(), { ...run, source }, project);
    const session = state.firmware.esp?.session;
    if (!session) throw new Error('Missing session');
    state = transitionSimulation(state, { type: 'stop' }, project);
    state = transitionSimulation(state, { ...run, source }, project);
    const current = state.firmware.esp?.session;
    expect(current).not.toBe(session);
    state = transitionSimulation(state, { ...http('/led/on'), session }, project);
    expect(state.firmware.esp?.httpResponse?.status).toBe(503);
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    if (!current) throw new Error('Missing new session');
    state = transitionSimulation(state, { ...http('/led/on'), session: current }, project);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
  });
  it('clears the one serial output without rerunning setup or disconnecting WiFi/server', () => {
    const project = fixture(), source = project.programs[0]?.source ?? '';
    let state = transitionSimulation(initialSimulation(), { ...run, source }, project);
    expect(state.firmware.esp?.execution?.serial.output).toContain('WiFi conectado');
    const wifi = state.firmware.esp?.execution?.wifi, session = state.firmware.esp?.session;
    state = transitionSimulation(state, { type: 'firmware-clear-serial', componentId: 'esp' }, project);
    expect(state.firmware.esp?.execution?.serial).toMatchObject({ baudRate: 115200, output: '', truncated: false });
    expect(state.firmware.esp?.execution?.wifi).toBe(wifi);
    expect(state.firmware.esp?.session).toBe(session);
    state = transitionSimulation(state, http('/led/on'), project);
    expect(state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
    state = transitionSimulation(state, { type: 'stop' }, project);
    state = transitionSimulation(state, { ...run, source }, project);
    expect(state.firmware.esp?.execution?.serial.output).toContain('Iniciando ESP8266...');
    expect(state.firmware.esp?.execution?.wifi.status).toBe(3);
  });
  it('isolates two board servers and the UNO Blink VM, with deterministic stop/restart', () => {
    const project = fixture();
    project.components.push(createComponent('esp8266', { x: 700, y: 0 }, 'other'), createComponent('arduino-uno', { x: 900, y: 0 }, 'uno'));
    const program = project.programs[0];
    if (!program) throw new Error('Missing program');
    project.programs.push({ ...program, componentId: 'other' });
    let state = initialSimulation();
    for (const componentId of ['esp', 'other']) state = transitionSimulation(state, { ...run, componentId, source: program.source }, project);
    state = transitionSimulation(state, { ...run, componentId: 'uno', source: 'void setup(){pinMode(13,OUTPUT);}void loop(){digitalWrite(13,HIGH);delay(1000);digitalWrite(13,LOW);delay(1000);}' }, project);
    state = transitionSimulation(state, http('/led/on', 'other'), project);
    expect(state.firmware.other?.execution?.levels.D5).toBe('HIGH');
    expect(state.firmware.esp?.execution?.levels.D5).toBe('LOW');
    expect(state.snapshot?.components.led?.brightness).toBe(0);
    state = transitionSimulation(state, { type: 'firmware-advance', elapsedMs: 1000 }, project);
    expect(state.firmware.uno?.execution?.levels.D13).toBe('LOW');
    state = transitionSimulation(state, { type: 'reset' }, project);
    state = transitionSimulation(state, { ...run, source: program.source }, project);
    expect(state.firmware.esp?.execution?.levels.D5).toBe('LOW');
  });
});
