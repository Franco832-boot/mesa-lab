import { LCD_TERMINALS } from './lcd';
import type {
  ComponentKind,
  ElectronicComponent,
  PinDefinition,
  PinReference,
  Point,
} from './types';
import { localToWorld } from './coordinates';
import {
  artworkPointToLocal,
  artworkScale,
  CONTACT_PITCH_MM,
  millimetersToWorld,
  physicalSpecs,
} from './physical';
import type { PhysicalSpec } from './physical';

export interface ContactGroup {
  id: string;
  pinIds: string[];
}
export interface ComponentDefinition {
  width: number;
  height: number;
  physical: PhysicalSpec;
  sourcePins: PinDefinition[];
  pins: PinDefinition[];
  contactGroups: ContactGroup[];
}
export const ledColors = {
  red: '#d85452',
  green: '#42aa71',
  blue: '#508bd3',
  yellow: '#ddb345',
} as const;
export type LedColor = keyof typeof ledColors;
export function isLedColor(value: unknown): value is LedColor {
  return typeof value === 'string' && Object.hasOwn(ledColors, value);
}
const range = (count: number) => Array.from({ length: count }, (_, i) => i);
const pin = (
  id: string,
  x: number,
  y: number,
  electricalType: PinDefinition['electricalType'] = 'passive',
  label = id,
): PinDefinition => ({ id, label, position: { x, y }, electricalType });

const unoTopIds = ['SCL', 'SDA', 'AREF', 'GND', ...range(14).map((i) => `D${13 - i}`)];
const unoBottomIds = [
  'NC',
  'IOREF',
  'RESET',
  '3V3',
  '5V',
  'GND-2',
  'GND-3',
  'VIN',
  ...range(6).map((i) => `A${i}`),
];
const unoPins: PinDefinition[] = [
  ...unoTopIds.map((id, i) => ({
    ...pin(
      id,
      90 + i * 13.5 + (i >= 10 ? 8.1 : 0),
      7.75,
      id === 'GND' ? 'ground' : id === 'AREF' ? 'analog' : 'digital',
      /^D/.test(id)
        ? `${[3, 5, 6, 9, 10, 11].includes(Number(id.slice(1))) ? '~' : ''}${id.slice(1)}`
        : id,
    ),
    maxVoltage: 5,
    ...(id.startsWith('D') ? { gpio: Number(id.slice(1)) } : {}),
  })),
  ...unoBottomIds.map((id, i) =>
    pin(
      id,
      120 + i * 13.5,
      264.25,
      id.startsWith('GND')
        ? 'ground'
        : id.startsWith('A')
          ? 'analog'
          : id === 'RESET'
            ? 'control'
            : id === 'NC'
              ? 'reserved'
              : 'power',
      id.startsWith('GND') ? 'GND' : id,
    ),
  ),
  ...['ICSP-MISO', 'ICSP-5V', 'ICSP-SCK', 'ICSP-MOSI', 'ICSP-RESET', 'ICSP-GND'].map((id, i) =>
    pin(
      id,
      302 + (i % 2) * 13.5,
      159 + Math.floor(i / 2) * 13.5,
      id.endsWith('GND') ? 'ground' : id.endsWith('5V') ? 'power' : 'digital',
    ),
  ),
];
export const espGpioMap = [
  { pin: 'D0', gpio: 16 },
  { pin: 'D1', gpio: 5 },
  { pin: 'D2', gpio: 4 },
  { pin: 'D3', gpio: 0, boot: 'HIGH' },
  { pin: 'D4', gpio: 2, boot: 'HIGH' },
  { pin: 'D5', gpio: 14 },
  { pin: 'D6', gpio: 12 },
  { pin: 'D7', gpio: 13 },
  { pin: 'D8', gpio: 15, boot: 'LOW' },
] as const;
const espLeftIds = [
  'A0',
  'RSV-1',
  'RSV-2',
  'SD3',
  'SD2',
  'SD1',
  'CMD',
  'SD0',
  'CLK',
  'GND',
  '3V3',
  'EN',
  'RST',
  'GND-2',
  'VIN',
];
const espRightIds = [
  'D0',
  'D1',
  'D2',
  'D3',
  'D4',
  '3V3-2',
  'GND-3',
  'D5',
  'D6',
  'D7',
  'D8',
  'RX',
  'TX',
  'GND-4',
  '3V3-3',
];
const espPins: PinDefinition[] = [espLeftIds, espRightIds].flatMap((ids, side) =>
  ids.map((id, i) => {
    const mapping = espGpioMap.find((item) => item.pin === id);
    return {
      ...pin(
        id,
        side === 0 ? 6.5 : 159.5,
        40 + i * 17,
        id.startsWith('GND')
          ? 'ground'
          : id.startsWith('3V3') || id === 'VIN'
            ? 'power'
            : id === 'A0'
              ? 'analog'
              : mapping || id === 'RX' || id === 'TX'
                ? 'digital'
                : id === 'EN' || id === 'RST'
                  ? 'control'
                  : 'reserved',
        id.replace(/-\d+$/, ''),
      ),
      ...(mapping
        ? { gpio: mapping.gpio }
        : id === 'RX'
          ? { gpio: 3 }
          : id === 'TX'
            ? { gpio: 1 }
            : {}),
      ...(mapping && 'boot' in mapping ? { bootLevel: mapping.boot } : {}),
      ...(id !== 'VIN' ? { maxVoltage: 3.3 } : {}),
    };
  }),
);
const rows = 'abcdefghij';
const breadboardPins: PinDefinition[] = range(63).flatMap((col) =>
  range(10).map((row) =>
    pin(`${rows[row]}${col + 1}`, 32.3 + col * 6.25, 37.3 + row * 6.25 + (row >= 5 ? 12.5 : 0)),
  ),
);
const rails = [
  { id: 'tp', y: 17.3, label: '+' },
  { id: 'tn', y: 25.3, label: '−' },
  { id: 'bp', y: 126.3, label: '+' },
  { id: 'bn', y: 134.3, label: '−' },
];
breadboardPins.push(
  ...rails.flatMap((rail) =>
    range(50).map((col) =>
      pin(
        `${rail.id}${col + 1}`,
        50.3 + col * 6.25 + Math.floor(col / 5) * 6.25,
        rail.y,
        'passive',
        `${rail.id} ${rail.label} ${col + 1}`,
      ),
    ),
  ),
);
const breadboardGroups: ContactGroup[] = [
  ...range(63).flatMap((col) =>
    ['abcde', 'fghij'].map((group) => ({
      id: `${group}-${col + 1}`,
      pinIds: [...group].map((row) => `${row}${col + 1}`),
    })),
  ),
  ...rails.map((rail) => ({ id: rail.id, pinIds: range(50).map((i) => `${rail.id}${i + 1}`) })),
];
const lcdHeaderPins = LCD_TERMINALS.map((id, index) => pin(id, 7.5 + index * 2.54, 3, id === 'VDD' || id === 'A' ? 'power' : id === 'VSS' || id === 'K' ? 'ground' : 'digital', `${index + 1} · ${id}`));
const sourceDefinitions: Record<
  ComponentKind,
  { pins: PinDefinition[]; contactGroups: ContactGroup[] }
> = {
  pcf8574: { pins: [...['GND','VCC','SDA','SCL'].map((id, index) => pin(id, -5, 7 + index * 2.54, id === 'GND' ? 'ground' : id === 'VCC' ? 'power' : 'digital')),
    ...LCD_TERMINALS.map((id, index) => pin(`LCD_${id}`, 1.95 + index * 2.54, 2, 'digital', `LCD · ${id}`))], contactGroups: [{ id: 'vcc', pinIds: ['VCC', 'LCD_VDD'] }, { id: 'ground', pinIds: ['GND', 'LCD_VSS', 'LCD_K'] }] },
  'lcd-20x4': { pins: lcdHeaderPins, contactGroups: [] },
  'lcd-16x2': { pins: lcdHeaderPins, contactGroups: [] },
  dht11: { pins: [pin('DATA', 5.46, 27, 'digital', 'S · OUT / DATA'),
    pin('VCC', 8, 27, 'power', '+ · VCC'), pin('GND', 10.54, 27, 'ground', '− · GND')], contactGroups: [] },
  'arduino-uno': {
    pins: unoPins.map((item) => {
      const gpio = /^A[0-5]$/.test(item.id)
        ? 14 + Number(item.id.slice(1))
        : item.id === 'SDA'
          ? 18
          : item.id === 'SCL'
            ? 19
            : item.id === 'ICSP-MISO'
              ? 12
              : item.id === 'ICSP-MOSI'
                ? 11
                : item.id === 'ICSP-SCK'
                  ? 13
                  : item.gpio;
      return gpio === undefined ? item : { ...item, gpio, maxVoltage: 5 };
    }),
    contactGroups: [
      { id: 'gnd', pinIds: ['GND', 'GND-2', 'GND-3', 'ICSP-GND'] },
      { id: '5v', pinIds: ['5V', 'ICSP-5V', 'IOREF'] },
      { id: 'sda', pinIds: ['SDA', 'A4'] },
      { id: 'scl', pinIds: ['SCL', 'A5'] },
      { id: 'miso', pinIds: ['D12', 'ICSP-MISO'] },
      { id: 'mosi', pinIds: ['D11', 'ICSP-MOSI'] },
      { id: 'sck', pinIds: ['D13', 'ICSP-SCK'] },
      { id: 'reset', pinIds: ['RESET', 'ICSP-RESET'] },
    ],
  },
  esp8266: {
    pins: espPins,
    contactGroups: [
      { id: 'gnd', pinIds: ['GND', 'GND-2', 'GND-3', 'GND-4'] },
      { id: '3v3', pinIds: ['3V3', '3V3-2', '3V3-3'] },
    ],
  },
  breadboard: { pins: breadboardPins, contactGroups: breadboardGroups },
  led: {
    pins: [
      pin('anode', 38 - (2.54 * (46 / 5)) / 2, 96, 'passive', 'A (+)'),
      pin('cathode', 38 + (2.54 * (46 / 5)) / 2, 96, 'passive', 'K (−)'),
    ],
    contactGroups: [],
  },
  resistor: {
    pins: [
      pin('1', 65 - millimetersToWorld(2 * CONTACT_PITCH_MM) / artworkScale('resistor'), 23),
      pin('2', 65 + millimetersToWorld(2 * CONTACT_PITCH_MM) / artworkScale('resistor'), 23),
    ],
    contactGroups: [],
  },
  pushbutton: {
    pins: [-1, 1].flatMap((side) =>
      [-1, 1].map((end) =>
        pin(
          String(side + 1 + (end === -1 ? 1 : 2)),
          44.5 + (end * millimetersToWorld(1.5 * CONTACT_PITCH_MM)) / artworkScale('pushbutton'),
          46 + (side * millimetersToWorld(CONTACT_PITCH_MM)) / artworkScale('pushbutton'),
        ),
      ),
    ),
    contactGroups: [
      { id: 'left', pinIds: ['1', '3'] },
      { id: 'right', pinIds: ['2', '4'] },
    ],
  },
  potentiometer: {
    pins: [
      pin('1', 45 - millimetersToWorld(CONTACT_PITCH_MM) / artworkScale('potentiometer'), 92),
      pin('wiper', 45, 92),
      pin('3', 45 + millimetersToWorld(CONTACT_PITCH_MM) / artworkScale('potentiometer'), 92),
    ],
    contactGroups: [],
  },
  'power-supply': {
    pins: [pin('positive', 29, 76, 'power', '+'), pin('negative', 55, 76, 'ground', '−')],
    contactGroups: [],
  },
};
function defineComponent(kind: ComponentKind): ComponentDefinition {
  const source = sourceDefinitions[kind];
  const physical = physicalSpecs[kind];
  return {
    width: millimetersToWorld(physical.widthMm),
    height: millimetersToWorld(physical.heightMm),
    physical,
    sourcePins: source.pins,
    pins: source.pins.map((pin) => ({ ...pin, position: artworkPointToLocal(kind, pin.position) })),
    contactGroups: source.contactGroups,
  };
}
export const componentDefinitions: Record<ComponentKind, ComponentDefinition> = {
  pcf8574: defineComponent('pcf8574'),
  'lcd-20x4': defineComponent('lcd-20x4'),
  'lcd-16x2': defineComponent('lcd-16x2'),
  dht11: defineComponent('dht11'),
  'arduino-uno': defineComponent('arduino-uno'),
  esp8266: defineComponent('esp8266'),
  breadboard: defineComponent('breadboard'),
  led: defineComponent('led'),
  resistor: defineComponent('resistor'),
  pushbutton: defineComponent('pushbutton'),
  potentiometer: defineComponent('potentiometer'),
  'power-supply': defineComponent('power-supply'),
};
const pinMaps = new Map(
  Object.entries(componentDefinitions).map(([kind, definition]) => [
    kind,
    new Map(definition.pins.map((item) => [item.id, item])),
  ]),
);
export function isComponentKind(value: unknown): value is ComponentKind {
  return typeof value === 'string' && Object.hasOwn(componentDefinitions, value);
}
export function isBoardComponent(
  component: ElectronicComponent,
): component is Extract<ElectronicComponent, { kind: 'arduino-uno' | 'esp8266' }> {
  return component.kind === 'arduino-uno' || component.kind === 'esp8266';
}
export function getPin(kind: ComponentKind, id: string): PinDefinition | undefined {
  return pinMaps.get(kind)?.get(id);
}
export function canonicalPinId(kind: ComponentKind, id: string): string {
  if (getPin(kind, id)) return id;
  // Phase 1 JSON sometimes used printed UNO digital labels instead of D-prefixed IDs.
  const alias =
    kind === 'arduino-uno' && /^~?\d+$/.test(id)
      ? `D${id.replace('~', '')}`
      : id === '3.3V'
        ? '3V3'
        : id;
  return alias;
}
export function pinWorldPosition(
  components: readonly ElectronicComponent[],
  reference: PinReference,
): Point | null {
  const component = components.find((item) => item.id === reference.componentId);
  if (!component) return null;
  const definition = getPin(component.kind, reference.pinId);
  return definition
    ? localToWorld(definition.position, component.position, component.rotation)
    : null;
}
export function newId(): string {
  return (
    crypto.randomUUID?.() ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('')
  );
}
export function createComponent(
  kind: ComponentKind,
  position: Point,
  id = newId(),
  color: LedColor = 'red',
): ElectronicComponent {
  const base = { id, position, rotation: 0 };
  switch (kind) {
    case 'pcf8574': return { ...base, kind, properties: { address: 0x27, contrast: 0.9 } };
    case 'lcd-20x4': case 'lcd-16x2': return { ...base, kind, properties: { controller: 'HD44780' } };
    case 'dht11': return { ...base, kind, properties: { temperature: 25, humidity: 50 } };
    case 'arduino-uno':
      return { ...base, kind, properties: { logicVoltage: 5 } };
    case 'esp8266':
      return { ...base, kind, properties: { logicVoltage: 3.3 } };
    case 'breadboard':
      return { ...base, kind, properties: { columns: 63 } };
    case 'led':
      return { ...base, kind, properties: { color } };
    case 'resistor':
      return { ...base, kind, properties: { resistance: 330 } };
    case 'pushbutton':
      return { ...base, kind, properties: { normallyClosed: false } };
    case 'potentiometer':
      return { ...base, kind, properties: { resistance: 10000, ratio: 0.5 } };
    case 'power-supply':
      return { ...base, kind, properties: { voltage: 5 } };
  }
}
