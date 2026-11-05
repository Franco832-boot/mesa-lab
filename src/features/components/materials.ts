const bandColors = [
  '#282b2b',
  '#774c32',
  '#b64a43',
  '#d98b42',
  '#d8c264',
  '#588965',
  '#5078a5',
  '#8d6794',
  '#8f9590',
  '#eee9dd',
];
/** Four-band display rounded to two significant digits; exact value stays in properties. */
export function resistorBands(resistance: number): string[] {
  let exponent = Math.floor(Math.log10(resistance)) - 1;
  let digits = Math.round(resistance / 10 ** exponent);
  if (digits === 100) {
    digits = 10;
    exponent++;
  }
  const multiplier =
    exponent === -2 ? '#c6c9c6' : exponent === -1 ? '#b99b5f' : bandColors[exponent];
  return [
    bandColors[Math.floor(digits / 10)] ?? '#8f9590',
    bandColors[digits % 10] ?? '#8f9590',
    multiplier ?? '#8f9590',
    '#b99b5f',
  ];
}
