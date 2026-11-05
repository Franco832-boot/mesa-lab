import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProject } from '../model/project';
import { evaluateCircuit } from './engine';
import { pinKey } from './topology';

const load = (name: string) => parseProject(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url), 'utf8'));
describe('importable Phase 3 examples', () => {
  it('solves the source/resistor/LED example at 3/330 A', () => {
    const result = evaluateCircuit(load('dc-led'));
    expect(result.components.led?.current).toBeCloseTo(3 / 330, 10);
    expect(result.components.led?.condition).toBe('active');
    expect(result.diagnostics).toEqual([]);
  });
  it('responds to pressing and releasing the example pushbutton', () => {
    const doc = load('pushbutton-led');
    expect(evaluateCircuit(doc).components.led?.brightness).toBe(0);
    expect(evaluateCircuit(doc, { buttons: { button: true } }).components.led?.current).toBeCloseTo(3 / 330, 10);
  });
  it('uses transient manual GPIO and includes finite 50 ohm drive resistance', () => {
    const doc = load('gpio-led');
    expect(evaluateCircuit(doc).components.led?.brightness).toBe(0);
    const high = evaluateCircuit(doc, { gpio: { [pinKey('board', 'D1')]: { mode: 'output', level: 'HIGH' } } });
    expect(high.components.led?.current).toBeCloseTo(1.3 / 380, 10);
  });
});
