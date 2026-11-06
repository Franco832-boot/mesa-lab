import { componentDefinitions, createComponent, pinWorldPosition } from './components';
import { planInsertion } from './breadboard';
import type { ElectronicComponent } from './types';

export function mountExampleComponent(components: readonly ElectronicComponent[], kind: 'dht11' | 'led' | 'resistor' | 'potentiometer', id: string, holeId: string): ElectronicComponent {
  const part = createComponent(kind, { x: 0, y: 0 }, id);
  const lead = componentDefinitions[kind].pins[0];
  const target = pinWorldPosition(components, { componentId: 'breadboard', pinId: holeId });
  if (!lead || !target) throw new Error('invalid-example-contact');
  const plan = planInsertion(components, { ...part, position: { x: target.x - lead.position.x, y: target.y - lead.position.y } });
  if (!plan.valid || !plan.component.attachments?.length) throw new Error('invalid-example-footprint');
  return plan.component;
}
