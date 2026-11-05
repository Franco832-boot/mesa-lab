import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import type { SimulationIssue } from '../../sim/types';
import { es } from '../../locales/es/messages';
import { en } from '../../locales/en/messages';
import { diagnosticGuidance, diagnosticRelatedComponents, groupDiagnostics } from './diagnostics';

const issue = (changes: Partial<SimulationIssue> = {}): SimulationIssue => ({
  code: 'open-circuit', severity: 'warning', componentIds: ['r1'], pinIds: ['1', '2'], ...changes,
});
describe('electrical diagnostic presentation', () => {
  it('deduplicates identical evidence despite ID ordering without mutating engine output', () => {
    const diagnostics = [issue({ componentIds: ['r2', 'r1'], pinIds: ['2', '1'] }), issue({ componentIds: ['r1', 'r2'] })];
    const original = JSON.stringify(diagnostics);
    const grouped = groupDiagnostics(diagnostics);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.count).toBe(2);
    expect(grouped[0]?.issue.componentIds).toEqual(['r1', 'r2']);
    expect(grouped[0]?.issue.pinIds).toEqual(['1', '2']);
    expect(JSON.stringify(diagnostics)).toBe(original);
  });
  it('retains distinct severity, components and terminals as separate causes', () => {
    const grouped = groupDiagnostics([
      issue(), issue({ severity: 'info' }), issue({ componentIds: ['r2'] }), issue({ pinIds: ['1'] }),
    ]);
    expect(grouped).toHaveLength(4);
    expect(grouped.every((group) => group.count === 1)).toBe(true);
  });
  it('orders errors before warnings before information with deterministic ties', () => {
    const diagnostics = [issue({ severity: 'info' }), issue(), issue({ code: 'short-circuit', severity: 'error' }), issue({ code: 'floating-node' })];
    const grouped = groupDiagnostics(diagnostics);
    expect(grouped.map((group) => group.issue.severity)).toEqual(['error', 'warning', 'warning', 'info']);
    expect(groupDiagnostics([...diagnostics].reverse())).toEqual(grouped);
  });
  it('keeps punctuation-containing IDs collision-safe', () => {
    expect(groupDiagnostics([issue({ componentIds: ['a,b'] }), issue({ componentIds: ['a', 'b'] })])).toHaveLength(2);
  });
  it('offers navigation only to existing related components, without duplicate targets', () => {
    const resistor = createComponent('resistor', { x: 0, y: 0 }, 'r1');
    const unrelated = createComponent('led', { x: 10, y: 0 }, 'led');
    expect(diagnosticRelatedComponents(issue({ componentIds: ['r1', 'missing', 'r1'] }), [resistor, unrelated])).toEqual([resistor]);
    expect(diagnosticRelatedComponents(issue({ componentIds: ['missing'] }), [resistor])).toEqual([]);
  });
  it('provides bilingual why/action guidance for every current diagnostic model', () => {
    expect(Object.keys(diagnosticGuidance)).toHaveLength(15);
    for (const guidance of Object.values(diagnosticGuidance)) {
      expect(es[guidance.why].length).toBeGreaterThan(20);
      expect(en[guidance.why].length).toBeGreaterThan(20);
      expect(es[guidance.action].length).toBeGreaterThan(20);
      expect(en[guidance.action].length).toBeGreaterThan(20);
    }
  });
  it('does not present unsupported networks as one known physical fault or warnings as permanent damage', () => {
    expect(en[diagnosticGuidance['unsupported-network'].why]).toContain('does not identify one physical fault');
    expect(en[diagnosticGuidance['led-overcurrent'].why]).toContain('does not establish permanent damage');
    expect(en[diagnosticGuidance['resistor-overpower'].why]).toContain('does not calculate physical temperature');
    expect(en[diagnosticGuidance['short-circuit'].why]).toContain('cannot calculate a finite short-circuit current');
  });
});
