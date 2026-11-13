import { describe, expect, it } from 'vitest';
import { componentDefinitions, createComponent, getPin } from './components';
import { createProject, parseProject, serializeProject } from './project';
import { mountExampleComponent } from './examplePlacement';
import { applyEditorCommand } from './editor';
import { phase1Source } from '../test/phase1';

describe('motor circuit foundation and actual contacts', () => {
  it('roundtrips new defaults without changing old documents', () => {
    const project = { ...createProject('motor'), components: ['dc-motor', 'l293d', 'battery-9v'].map((kind) => {
      if (kind !== 'dc-motor' && kind !== 'l293d' && kind !== 'battery-9v') throw new Error('fixture');
      return createComponent(kind, { x: 0, y: 0 }, kind);
    }) };
    expect(parseProject(serializeProject(project))).toEqual(project);
    expect(parseProject(serializeProject(parseProject(phase1Source)))).toEqual(parseProject(phase1Source));
    const battery = project.components.find((part) => part.kind === 'battery-9v');
    if (battery?.kind !== 'battery-9v') throw new Error('fixture');
    delete battery.properties.internalResistance;
    expect(parseProject(serializeProject(project))).toEqual(project);
    battery.properties.internalResistance = -1;
    expect(() => parseProject(serializeProject(project))).toThrow();
  });
  it('has real DIP numbering, pitch and row spacing, and two motor/battery terminals', () => {
    const pins = componentDefinitions.l293d.pins;
    expect(pins.map((pin) => pin.label)).toEqual([
      '1 · EN1,2', '2 · IN1', '3 · OUT1', '4 · GND', '5 · GND-2', '6 · OUT2', '7 · IN2', '8 · VCC2',
      '9 · EN3,4', '10 · IN3', '11 · OUT3', '12 · GND-3', '13 · GND-4', '14 · OUT4', '15 · IN4', '16 · VCC1',
    ]);
    expect((getPin('l293d', 'IN1')?.position.x ?? 0) - (getPin('l293d', 'EN1,2')?.position.x ?? 0)).toBeCloseTo(10.16, 10);
    expect((getPin('l293d', 'EN1,2')?.position.y ?? 0) - (getPin('l293d', 'VCC1')?.position.y ?? 0)).toBeCloseTo(30.48, 10);
    expect(componentDefinitions['dc-motor'].pins).toHaveLength(2);
    expect(componentDefinitions['battery-9v'].pins).toHaveLength(2);
  });
  it('inserts all 16 leads across the breadboard trench, survives JSON and moves with the board', () => {
    const board = createComponent('breadboard', { x: 50, y: 350 }, 'breadboard');
    const driver = mountExampleComponent([board], 'l293d', 'bridge', 'f25');
    expect(driver.attachments).toHaveLength(16);
    expect(driver.attachments?.find((lead) => lead.pinId === 'VCC1')?.holeId).toBe('e25');
    expect(driver.attachments?.find((lead) => lead.pinId === 'VCC2')?.holeId).toBe('f32');
    const project = { ...createProject('dip'), components: [board, driver] };
    expect(parseProject(serializeProject(project))).toEqual(project);
    const moved = applyEditorCommand(project, { type: 'move', positions: { breadboard: { x: 60, y: 360 } } });
    expect(moved.components.find((part) => part.id === 'bridge')?.position).toEqual({ x: driver.position.x + 10, y: driver.position.y + 10 });
  });
});
