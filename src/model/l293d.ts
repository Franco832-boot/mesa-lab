/** Top view, notch on the left in the horizontal artwork. */
export const L293D_PINS = [
  'EN1,2', 'IN1', 'OUT1', 'GND', 'GND-2', 'OUT2', 'IN2', 'VCC2',
  'EN3,4', 'IN3', 'OUT3', 'GND-3', 'GND-4', 'OUT4', 'IN4', 'VCC1',
] as const;
export const L293D_CHANNELS = [
  { enable: 'EN1,2', inputs: ['IN1', 'IN2'], outputs: ['OUT1', 'OUT2'] },
  { enable: 'EN3,4', inputs: ['IN3', 'IN4'], outputs: ['OUT3', 'OUT4'] },
] as const;
