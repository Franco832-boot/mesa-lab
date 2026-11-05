// Literal historical fixture: deliberately independent of the current factory.
export const phase1Source = JSON.stringify({
  format: 'mesa-circuit',
  version: 1,
  id: 'phase-one-lab',
  name: 'Fase 1',
  components: [
    {
      id: 'uno-reference',
      kind: 'arduino-uno',
      position: { x: 95, y: 145 },
      rotation: 0,
      properties: { logicVoltage: 5 },
    },
    {
      id: 'esp-reference',
      kind: 'esp8266',
      position: { x: 515, y: 108 },
      rotation: 0,
      properties: { logicVoltage: 3.3 },
    },
    {
      id: 'breadboard-reference',
      kind: 'breadboard',
      position: { x: 135, y: 475 },
      rotation: 0,
      properties: { columns: 63 },
    },
  ],
  wires: [],
  programs: [],
  viewport: { offset: { x: 15, y: -23 }, zoom: 0.7 },
});
