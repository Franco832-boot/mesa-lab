import type { ComponentKind, Point } from './types';

/** The only physical representation scale. Viewport zoom is applied afterwards. */
export const WORLD_UNITS_PER_MM = 4;
export const CONTACT_PITCH_MM = 2.54;
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PhysicalSpec {
  model: string;
  widthMm: number;
  heightMm: number;
  /** Actual body in the original drawing; excludes leads, labels and viewBox margins. */
  sourceBody: Bounds;
  sourceViewBox: Bounds;
}
const unoUnitsPerMm = 13.5 / CONTACT_PITCH_MM;
const espUnitsPerMm = 17 / CONTACT_PITCH_MM;
const breadboardUnitsPerMm = 6.25 / CONTACT_PITCH_MM;
const ledUnitsPerMm = 46 / 5;
const resistorUnitsPerMm = 74 / 6.3;
export const physicalSpecs: Record<ComponentKind, PhysicalSpec> = {
  'arduino-uno': {
    model: 'Arduino UNO R3',
    widthMm: 68.6,
    heightMm: 53.4,
    sourceBody: {
      x: 174.5 - (68.6 * unoUnitsPerMm) / 2,
      y: 136 - (53.4 * unoUnitsPerMm) / 2,
      width: 68.6 * unoUnitsPerMm,
      height: 53.4 * unoUnitsPerMm,
    },
    sourceViewBox: { x: -14, y: -10, width: 380, height: 294 },
  },
  esp8266: {
    model: 'NodeMCU DevKit v1.0 (ESP-12E)',
    widthMm: 25.4,
    heightMm: 48.26,
    sourceBody: {
      x: 83 - (25.4 * espUnitsPerMm) / 2,
      y: 159 - (48.26 * espUnitsPerMm) / 2,
      width: 25.4 * espUnitsPerMm,
      height: 48.26 * espUnitsPerMm,
    },
    sourceViewBox: { x: -12, y: -8, width: 190, height: 334 },
  },
  breadboard: {
    model: 'BB830 · 830 contacts',
    widthMm: 165.1,
    heightMm: 54.6,
    sourceBody: {
      x: 32.3 - 3.81 * breadboardUnitsPerMm,
      y: 8.6,
      width: 165.1 * breadboardUnitsPerMm,
      height: 54.6 * breadboardUnitsPerMm,
    },
    sourceViewBox: { x: 20, y: 5, width: 412, height: 142 },
  },
  led: {
    model: 'T-1¾ · lens Ø5 mm · trimmed leads',
    widthMm: 5.9,
    heightMm: 8.6,
    sourceBody: {
      x: 38 - (5.9 * ledUnitsPerMm) / 2,
      y: 58 - 8.6 * ledUnitsPerMm,
      width: 5.9 * ledUnitsPerMm,
      height: 8.6 * ledUnitsPerMm,
    },
    sourceViewBox: { x: 0, y: -28, width: 76, height: 130 },
  },
  resistor: {
    model: 'CFR-25 · axial ¼ W · trimmed leads',
    widthMm: 6.3,
    heightMm: 2.4,
    sourceBody: {
      x: 28,
      y: 23 - (2.4 * resistorUnitsPerMm) / 2,
      width: 74,
      height: 2.4 * resistorUnitsPerMm,
    },
    sourceViewBox: { x: -5, y: 3, width: 140, height: 40 },
  },
  pushbutton: {
    model: 'Tactile · nominal 6 × 6 mm',
    widthMm: 6,
    heightMm: 6,
    sourceBody: { x: 16, y: 13, width: 58, height: 58 },
    sourceViewBox: { x: 0, y: 7, width: 90, height: 77 },
  },
  potentiometer: {
    model: 'Round trimmer · nominal Ø10 mm',
    widthMm: 10,
    heightMm: 10,
    sourceBody: { x: 13, y: 12, width: 64, height: 64 },
    sourceViewBox: { x: 6, y: 5, width: 78, height: 94 },
  },
  'power-supply': {
    model: 'Virtual bench supply · 90 × 60 mm enclosure',
    widthMm: 90,
    heightMm: 60,
    sourceBody: { x: 4, y: 4, width: 142, height: (142 * 60) / 90 },
    sourceViewBox: { x: 0, y: 0, width: 150, height: 103 },
  },
};
export function millimetersToWorld(value: number): number {
  return value * WORLD_UNITS_PER_MM;
}
export function artworkScale(kind: ComponentKind): number {
  const spec = physicalSpecs[kind];
  return millimetersToWorld(spec.widthMm) / spec.sourceBody.width;
}
export function artworkPointToLocal(kind: ComponentKind, point: Point): Point {
  const spec = physicalSpecs[kind];
  const scale = artworkScale(kind);
  return { x: (point.x - spec.sourceBody.x) * scale, y: (point.y - spec.sourceBody.y) * scale };
}
export function artworkTransform(kind: ComponentKind): string {
  const body = physicalSpecs[kind].sourceBody;
  return `scale(${artworkScale(kind)}) translate(${-body.x} ${-body.y})`;
}
export function visualBounds(kind: ComponentKind): Bounds {
  const spec = physicalSpecs[kind];
  const point = artworkPointToLocal(kind, spec.sourceViewBox);
  return {
    ...point,
    width: spec.sourceViewBox.width * artworkScale(kind),
    height: spec.sourceViewBox.height * artworkScale(kind),
  };
}
