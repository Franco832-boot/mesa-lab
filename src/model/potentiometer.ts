import type { Point } from './types';

export const POTENTIOMETER_SWEEP_DEGREES = 270;
export const clampPotentiometerRatio = (ratio: number): number => Math.max(0, Math.min(1, ratio));
export const potentiometerAngle = (ratio: number): number =>
  (ratio - 0.5) * POTENTIOMETER_SWEEP_DEGREES;

/** Clockwise angle from the top. Ignore the center, where angle is unstable. */
export function potentiometerPointerAngle(point: Point): number | null {
  return Math.hypot(point.x, point.y) < 4
    ? null
    : Math.atan2(point.x, -point.y) * 180 / Math.PI;
}

/** Relative rotation avoids jumps on grabbing the knob or crossing the ±180° seam. */
export function advancePotentiometerRatio(ratio: number, previousAngle: number, angle: number): number {
  const delta = ((angle - previousAngle + 540) % 360) - 180;
  return clampPotentiometerRatio(ratio + delta / POTENTIOMETER_SWEEP_DEGREES);
}
/** A center grab has no stable angle; use two knob diameters of vertical travel. */
export function advancePotentiometerVerticalRatio(ratio: number, deltaY: number): number {
  return clampPotentiometerRatio(ratio - deltaY / 80);
}

/** Ideal linear track; terminal 1 → wiper → terminal 3. Inputs are validated at the document/input boundary. */
export function potentiometerResistances(totalResistance: number, ratio: number): {
  toTerminal1: number;
  toTerminal3: number;
} {
  return { toTerminal1: totalResistance * ratio, toTerminal3: totalResistance * (1 - ratio) };
}
