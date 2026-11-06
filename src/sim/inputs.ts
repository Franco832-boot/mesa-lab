import { componentDefinitions } from '../model/components';
import type { CircuitProject } from '../model/types';
import { pinKey } from './topology';
import type { SimulationInputs, SimulationIssue } from './types';
import { validDhtEnvironment } from '../model/dht11';
import { isLcdKind, validLcdController } from '../model/lcd';

export function validateInputs(project: CircuitProject, inputs: SimulationInputs): SimulationIssue[] {
  const components = new Map(project.components.map((component) => [component.id, component]));
  const issues: SimulationIssue[] = [];
  const invalid = (componentIds: string[], pinIds: string[] = []) => issues.push({ code: 'invalid-input', severity: 'error', componentIds, pinIds });
  for (const [id, controller] of Object.entries(inputs.lcd ?? {})) {
    if (!isLcdKind(components.get(id)?.kind ?? '') || !validLcdController(controller)) invalid([id]);
  }
  for (const [id, latch] of Object.entries(inputs.pcf8574 ?? {})) {
    if (components.get(id)?.kind !== 'pcf8574' || !Number.isInteger(latch) || latch < 0 || latch > 255) invalid([id]);
  }
  for (const [id, environment] of Object.entries(inputs.dht11 ?? {})) {
    if (components.get(id)?.kind !== 'dht11' || !validDhtEnvironment(environment)) invalid([id]);
  }
  for (const [id, pressed] of Object.entries(inputs.buttons ?? {})) {
    if (components.get(id)?.kind !== 'pushbutton' || typeof pressed !== 'boolean') invalid([id]);
  }
  for (const [id, ratio] of Object.entries(inputs.potentiometers ?? {})) {
    if (components.get(id)?.kind !== 'potentiometer' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) invalid([id]);
  }
  const gpioKeys = new Map(project.components.flatMap((component) =>
    component.kind === 'arduino-uno' || component.kind === 'esp8266'
      ? componentDefinitions[component.kind].pins.filter((pin) => pin.gpio !== undefined).map((pin) => [pinKey(component.id, pin.id), { componentId: component.id, pinId: pin.id, gpio: pin.gpio }] as const)
      : [],
  ));
  const aliases = new Map<string, string>();
  for (const [key, state] of Object.entries(inputs.gpio ?? {})) {
    const pin = gpioKeys.get(key);
    if (!pin || !state || !['input', 'input-pullup', 'output'].includes(state.mode) || !['HIGH', 'LOW', 'FLOATING'].includes(state.level)) { invalid(pin ? [pin.componentId] : [], pin ? [pin.pinId] : []); continue; }
    if (components.get(pin.componentId)?.kind === 'esp8266' && pin.gpio === 16 && state.mode === 'input-pullup') { invalid([pin.componentId], [pin.pinId]); continue; }
    const canonical = pinKey(pin.componentId, String(pin.gpio));
    const signature = `${state.mode}:${state.mode === 'output' ? state.level : 'FLOATING'}`;
    const previous = aliases.get(canonical);
    if (previous !== undefined && previous !== signature) invalid([pin.componentId], [pin.pinId]);
    aliases.set(canonical, signature);
  }
  return issues;
}
