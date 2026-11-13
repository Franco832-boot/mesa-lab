import { componentDefinitions } from '../../model/components';
export { espGpioMap } from '../../model/components';
import type { ComponentKind } from '../../model/types';
import type { TranslationKey } from '../../locales/es/messages';
export const ledOptions = [
  { value: 'red', label: 'colorRed' },
  { value: 'green', label: 'colorGreen' },
  { value: 'blue', label: 'colorBlue' },
  { value: 'yellow', label: 'colorYellow' },
] as const;

export interface CatalogEntry {
  kind: ComponentKind;
  name: TranslationKey;
  description: TranslationKey;
  category: 'boards' | 'basic';
}
export const catalog: CatalogEntry[] = [
  { kind: 'dc-motor', name: 'motorName', description: 'motorDescription', category: 'basic' },
  { kind: 'l293d', name: 'driverName', description: 'driverDescription', category: 'basic' },
  { kind: 'battery-9v', name: 'batteryName', description: 'batteryDescription', category: 'basic' },
  { kind: 'pcf8574', name: 'pcfName', description: 'pcfDescription', category: 'basic' },
  { kind: 'lcd-20x4', name: 'lcd20Name', description: 'lcdDescription', category: 'basic' },
  { kind: 'lcd-16x2', name: 'lcd16Name', description: 'lcdDescription', category: 'basic' },
  { kind: 'dht11', name: 'dht11_name', description: 'dht11_description', category: 'basic' },
  {
    kind: 'arduino-uno',
    name: 'arduino-uno_name',
    description: 'arduino-uno_description',
    category: 'boards',
  },
  {
    kind: 'esp8266',
    name: 'esp8266_name',
    description: 'esp8266_description',
    category: 'boards',
  },
  {
    kind: 'breadboard',
    name: 'breadboard_name',
    description: 'breadboard_description',
    category: 'basic',
  },
  {
    kind: 'led',
    name: 'led_name',
    description: 'led_description',
    category: 'basic',
  },
  {
    kind: 'resistor',
    name: 'resistor_name',
    description: 'resistor_description',
    category: 'basic',
  },
  {
    kind: 'pushbutton',
    name: 'pushbutton_name',
    description: 'pushbutton_description',
    category: 'basic',
  },
  {
    kind: 'potentiometer',
    name: 'potentiometer_name',
    description: 'potentiometer_description',
    category: 'basic',
  },
  {
    kind: 'power-supply',
    name: 'power-supply_name',
    description: 'power-supply_description',
    category: 'basic',
  },
];
export function getCatalogEntry(kind: ComponentKind) {
  const entry = catalog.find((item) => item.kind === kind);
  if (!entry) throw new Error(`Unknown component: ${kind}`);
  return { ...entry, ...componentDefinitions[kind] };
}
