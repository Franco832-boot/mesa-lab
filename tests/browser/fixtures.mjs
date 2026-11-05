// Literal public v1 documents, independent of the engine and application factories.
export function component(kind, id, x, y, properties) {
  return { id, kind, position: { x, y }, rotation: 0, properties };
}
export function wire(id, a, ap, b, bp) {
  return {
    id,
    from: { componentId: a, pinId: ap },
    to: { componentId: b, pinId: bp },
    color: '#668c75',
    waypoints: [],
  };
}
export function project(components = [], wires = []) {
  return {
    format: 'mesa-circuit', version: 1, id: 'browser-fixture', name: 'Browser circuit',
    components, wires, programs: [],
    viewport: { offset: { x: 20, y: 20 }, zoom: 0.8 },
  };
}
export function ledCircuit({ reversed = false, open = false, button = false } = {}) {
  const parts = [
    component('power-supply', 'source', 25, 75, { voltage: 5 }),
    component('resistor', 'r', 440, 100, { resistance: 330 }),
    component('led', 'led', 570, 100, { color: 'red' }),
  ];
  const connections = [
    wire('supply', 'source', 'positive', 'r', '1'),
    wire('anode', 'r', '2', 'led', reversed ? 'cathode' : 'anode'),
  ];
  if (button) {
    parts.push(component('pushbutton', 'button', 620, 170, { normallyClosed: false }));
    connections.push(wire('contact', 'led', 'cathode', 'button', '1'));
    connections.push(wire('return', 'button', '2', 'source', 'negative'));
  } else if (!open) {
    connections.push(wire('return', 'led', reversed ? 'anode' : 'cathode', 'source', 'negative'));
  }
  return project(parts, connections);
}
export function gpioCircuit({ overvoltage = false } = {}) {
  const board = component('esp8266', 'board', 60, 70, { logicVoltage: 3.3 });
  if (overvoltage) return project([
    board, component('power-supply', 'source', 250, 80, { voltage: 5 }),
  ], [
    wire('input', 'source', 'positive', 'board', 'D1'),
    wire('ground', 'source', 'negative', 'board', 'GND'),
  ]);
  return project([
    board,
    component('resistor', 'r', 260, 100, { resistance: 330 }),
    component('led', 'led', 390, 100, { color: 'red' }),
  ], [
    wire('output', 'board', 'D1', 'r', '1'),
    wire('anode', 'r', '2', 'led', 'anode'),
    wire('ground', 'led', 'cathode', 'board', 'GND'),
  ]);
}
export function overheatedCircuit() {
  return project([
    component('power-supply', 'source', 25, 75, { voltage: 5 }),
    component('resistor', 'r', 440, 100, { resistance: 10 }),
  ], [
    wire('positive', 'source', 'positive', 'r', '1'),
    wire('negative', 'source', 'negative', 'r', '2'),
  ]);
}

export function unsupportedCircuit() {
  return project([
    component('power-supply', 'source', 25, 75, { voltage: 5 }),
    component('led', 'led', 440, 100, { color: 'red' }),
  ], [
    wire('positive', 'source', 'positive', 'led', 'anode'),
    wire('negative', 'source', 'negative', 'led', 'cathode'),
  ]);
}
