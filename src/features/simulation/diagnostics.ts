import type { TranslationKey } from '../../locales/es/messages';
import type { ElectronicComponent } from '../../model/types';
import type { DiagnosticCode, SimulationIssue } from '../../sim/types';

export interface GroupedDiagnostic {
  key: string;
  issue: SimulationIssue;
  count: number;
}
const severityOrder: Record<SimulationIssue['severity'], number> = { error: 0, warning: 1, info: 2 };

/** Deduplicate only exact causes; IDs and severity remain part of the canonical identity. */
export function groupDiagnostics(diagnostics: readonly SimulationIssue[]): readonly GroupedDiagnostic[] {
  const grouped = new Map<string, GroupedDiagnostic>();
  for (const diagnostic of diagnostics) {
    const componentIds = [...diagnostic.componentIds].sort();
    const pinIds = [...diagnostic.pinIds].sort();
    const key = JSON.stringify([diagnostic.code, diagnostic.severity, componentIds, pinIds]);
    const existing = grouped.get(key);
    if (existing) existing.count++;
    else grouped.set(key, { key, issue: { ...diagnostic, componentIds, pinIds }, count: 1 });
  }
  return [...grouped.values()].sort((left, right) =>
    severityOrder[left.issue.severity] - severityOrder[right.issue.severity]
    || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  );
}

export function diagnosticRelatedComponents(
  diagnostic: SimulationIssue,
  components: readonly ElectronicComponent[],
): readonly ElectronicComponent[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  return [...new Set(diagnostic.componentIds)].map((id) => byId.get(id))
    .filter((component): component is ElectronicComponent => component !== undefined);
}

/** Qualified guidance describes model evidence, never an invented physical cause or damage event. */
export const diagnosticGuidance: Record<DiagnosticCode, { why: TranslationKey; action: TranslationKey }> = {
  'invalid-reference': { why: 'diagnosticWhyInvalidReference', action: 'diagnosticActionInvalidReference' },
  'invalid-input': { why: 'diagnosticWhyInvalidInput', action: 'diagnosticActionInvalidInput' },
  'disconnected-component': { why: 'diagnosticWhyDisconnected', action: 'diagnosticActionDisconnected' },
  'open-circuit': { why: 'diagnosticWhyOpenCircuit', action: 'diagnosticActionOpenCircuit' },
  'floating-node': { why: 'diagnosticWhyFloating', action: 'diagnosticActionFloating' },
  'short-circuit': { why: 'diagnosticWhyShort', action: 'diagnosticActionShort' },
  'contradictory-sources': { why: 'diagnosticWhySources', action: 'diagnosticActionSources' },
  'unsupported-network': { why: 'diagnosticWhyUnsupported', action: 'diagnosticActionUnsupported' },
  'reverse-polarity': { why: 'diagnosticWhyReverse', action: 'diagnosticActionReverse' },
  'led-overcurrent': { why: 'diagnosticWhyLedCurrent', action: 'diagnosticActionLedCurrent' },
  'resistor-overpower': { why: 'diagnosticWhyResistorPower', action: 'diagnosticActionResistorPower' },
  'gpio-overcurrent': { why: 'diagnosticWhyGpioCurrent', action: 'diagnosticActionGpioCurrent' },
  'gpio-overvoltage': { why: 'diagnosticWhyGpioVoltage', action: 'diagnosticActionGpioVoltage' },
  'boot-sensitive-pin': { why: 'diagnosticWhyBootPin', action: 'diagnosticActionBootPin' },
  'unsupported-pin': { why: 'diagnosticWhyUnsupportedPin', action: 'diagnosticActionUnsupportedPin' },
};
