import { describe, expect, it } from 'vitest';
import {
  advancePotentiometerRatio,
  advancePotentiometerVerticalRatio,
  potentiometerAngle,
  potentiometerPointerAngle,
  potentiometerResistances,
} from './potentiometer';

describe('potentiometer mechanics and track', () => {
  it('uses a centered 270 degree mechanical sweep', () => {
    expect(potentiometerAngle(0)).toBe(-135);
    expect(potentiometerAngle(0.5)).toBe(0);
    expect(potentiometerAngle(1)).toBe(135);
  });
  it('ignores unstable center angles and measures clockwise from the top', () => {
    expect(potentiometerPointerAngle({ x: 0, y: 0 })).toBeNull();
    expect(potentiometerPointerAngle({ x: 1, y: -1 })).toBeNull();
    expect(potentiometerPointerAngle({ x: 0, y: -10 })).toBe(0);
    expect(potentiometerPointerAngle({ x: 10, y: 0 })).toBe(90);
    expect(potentiometerPointerAngle({ x: -10, y: 0 })).toBe(-90);
  });
  it('unwraps a 20 degree turn across the pointer seam in either direction', () => {
    expect(advancePotentiometerRatio(0.5, 170, -170)).toBeCloseTo(0.5 + 20 / 270, 10);
    expect(advancePotentiometerRatio(0.5, -170, 170)).toBeCloseTo(0.5 - 20 / 270, 10);
  });
  it('clamps at endpoints and reverses smoothly without jumping across the dead zone', () => {
    expect(advancePotentiometerRatio(1, 170, -170)).toBe(1);
    expect(advancePotentiometerRatio(0, -170, 170)).toBe(0);
    expect(advancePotentiometerRatio(1, -170, 170)).toBeCloseTo(1 - 20 / 270, 10);
    expect(advancePotentiometerRatio(0.5, 42, 42)).toBe(0.5);
  });
  it('responds to a vertical center grab without relying on an undefined angular origin', () => {
    expect(advancePotentiometerVerticalRatio(0.5, -20)).toBe(0.75);
    expect(advancePotentiometerVerticalRatio(0.5, 40)).toBe(0);
    expect(advancePotentiometerVerticalRatio(0, -100)).toBe(1);
  });
  it('reports both segments of a 10k linear track at 25% and its physical endpoints', () => {
    expect(potentiometerResistances(10000, 0.25)).toEqual({ toTerminal1: 2500, toTerminal3: 7500 });
    expect(potentiometerResistances(10000, 0)).toEqual({ toTerminal1: 0, toTerminal3: 10000 });
    expect(potentiometerResistances(10000, 1)).toEqual({ toTerminal1: 10000, toTerminal3: 0 });
  });
});
