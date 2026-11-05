import type { Branch } from './models';
import { solveLinear } from './linear';
import { UnionFind } from './topology';
import type { SimulationIssue } from './types';

const CURRENT_EPSILON = 1e-10;
export const MAX_MATRIX_UNKNOWNS = 96;
export const MAX_LEDS_PER_ISLAND = 6;
export interface DcResult {
  voltages: Map<string, number>;
  currents: Map<string, number>;
  references: Map<string, string>;
  diagnostics: SimulationIssue[];
}
function issue(code: SimulationIssue['code'], branches: readonly Branch[]): SimulationIssue {
  return { code, severity: code === 'unsupported-network' || code === 'floating-node' ? 'warning' : 'error', componentIds: [...new Set(branches.map((branch) => branch.componentId))].sort(), pinIds: [] };
}
function sourceConflict(branches: readonly Branch[]): SimulationIssue | undefined {
  const sources = branches.filter((branch) => branch.kind === 'source');
  if (sources.some((branch) => branch.a === branch.b && Math.abs(branch.value) > 1e-9)) return issue('short-circuit', sources);
  const graph = new Map<string, { to: string; delta: number }[]>();
  for (const branch of sources) {
    graph.set(branch.a, [...(graph.get(branch.a) ?? []), { to: branch.b, delta: -branch.value }]);
    graph.set(branch.b, [...(graph.get(branch.b) ?? []), { to: branch.a, delta: branch.value }]);
  }
  const assigned = new Map<string, number>();
  for (const origin of graph.keys()) {
    if (assigned.has(origin)) continue;
    assigned.set(origin, 0);
    const queue = [origin];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const from = queue[cursor];
      if (from === undefined) continue;
      for (const edge of graph.get(from) ?? []) {
        const value = (assigned.get(from) ?? 0) + edge.delta;
        const old = assigned.get(edge.to);
        if (old !== undefined && Math.abs(old - value) > 1e-8) return issue('contradictory-sources', sources);
        if (old === undefined) { assigned.set(edge.to, value); queue.push(edge.to); }
      }
    }
  }
  return undefined;
}
interface LinearResult { voltages: Map<string, number>; currents: Map<string, number>; references: Map<string,string> }
/** A reference belongs only to its physically connected conductive island. */
function linearNetwork(branches: readonly Branch[]): LinearResult | 'inconsistent' | 'underdetermined' {
  const voltages = new Map<string, number>();
  const currents = new Map<string, number>();
  const references = new Map<string, string>();
  const sets = new UnionFind();
  for (const branch of branches) { sets.add(branch.a); sets.add(branch.b); sets.union(branch.a, branch.b); }
  const islands = new Map<string, Branch[]>();
  for (const branch of branches) {
    const key = sets.find(branch.a);
    const list = islands.get(key) ?? [];
    list.push(branch);
    islands.set(key, list);
  }
  for (const island of islands.values()) {
    const reference = island.find((branch) => branch.kind === 'source')?.b;
    if (reference === undefined) continue;
    const nodes = [...new Set(island.flatMap((branch) => [branch.a, branch.b]))].filter((node) => node !== reference).sort();
    const constrained = island.filter((branch) => branch.kind !== 'resistor' && branch.a !== branch.b);
    const size = nodes.length + constrained.length;
    if (size > MAX_MATRIX_UNKNOWNS) return 'inconsistent';
    const indices = new Map(nodes.map((node, index) => [node, index]));
    const matrix = Array.from({ length: size }, () => new Float64Array(size));
    const rhs = new Float64Array(size);
    const stamp = (row: number | undefined, column: number | undefined, value: number) => {
      if (row === undefined || column === undefined) return;
      const target = matrix[row];
      if (target) target[column] = (target[column] ?? 0) + value;
    };
    for (const branch of island) {
      if (branch.kind !== 'resistor') continue;
      const a = indices.get(branch.a), b = indices.get(branch.b);
      const conductance = 1 / branch.value;
      stamp(a, a, conductance); stamp(b, b, conductance);
      stamp(a, b, -conductance); stamp(b, a, -conductance);
    }
    constrained.forEach((branch, index) => {
      const equation = nodes.length + index;
      const a = indices.get(branch.a), b = indices.get(branch.b);
      stamp(a, equation, 1); stamp(b, equation, -1);
      stamp(equation, a, 1); stamp(equation, b, -1);
      rhs[equation] = branch.value;
    });
    const solution = solveLinear(matrix, rhs);
    if (typeof solution === 'string') return solution;
    for (const node of [reference, ...nodes]) references.set(node, reference);
    voltages.set(reference, 0);
    nodes.forEach((node, index) => voltages.set(node, solution[index] ?? 0));
    constrained.forEach((branch, index) => currents.set(branch.id, solution[nodes.length + index] ?? 0));
    for (const branch of island) if (branch.kind === 'resistor') {
      currents.set(branch.id, ((voltages.get(branch.a) ?? 0) - (voltages.get(branch.b) ?? 0)) / branch.value);
    }
  }
  return { voltages, currents, references };
}
export function evaluateDc(branches: readonly Branch[]): DcResult {
  const result: DcResult = { voltages: new Map(), currents: new Map(), references: new Map(), diagnostics: [] };
  // Partition using all possible paths, then solve independent islands separately.
  const sets = new UnionFind();
  for (const branch of branches) { sets.add(branch.a); sets.add(branch.b); sets.union(branch.a, branch.b); }
  const islands = new Map<string, Branch[]>();
  for (const branch of branches) {
    const key = sets.find(branch.a);
    const list = islands.get(key) ?? []; list.push(branch); islands.set(key, list);
  }
  for (const island of islands.values()) {
    const conflict = sourceConflict(island);
    if (conflict) { result.diagnostics.push(conflict); continue; }
    if (!island.some((branch) => branch.kind === 'source')) {
      result.diagnostics.push(issue('floating-node', island)); continue;
    }
    const leds = island.filter((branch) => branch.kind === 'led');
    if (leds.length > MAX_LEDS_PER_ISLAND) { result.diagnostics.push(issue('unsupported-network', island)); continue; }
    if (island.some((branch) => branch.kind === 'source' && branch.a === branch.b)) { result.diagnostics.push(issue('unsupported-network', island)); continue; }
    let accepted: LinearResult | undefined;
    let ambiguous = false;
    // Exact bounded active-set enumeration; no nonlinear convergence guess or gmin.
    for (let mask = (1 << leds.length) - 1; mask >= 0; mask--) {
      const active = new Set(leds.filter((_, index) => (mask & (1 << index)) !== 0).map((branch) => branch.id));
      const candidate = linearNetwork(island.filter((branch) => branch.kind !== 'led' || active.has(branch.id)));
      if (candidate === 'underdetermined') { ambiguous = true; continue; }
      if (candidate === 'inconsistent') continue;
      const valid = leds.every((branch) => {
        if (active.has(branch.id)) return (candidate.currents.get(branch.id) ?? 0) > CURRENT_EPSILON;
        const a = candidate.voltages.get(branch.a), b = candidate.voltages.get(branch.b);
        return a === undefined || b === undefined || candidate.references.get(branch.a) !== candidate.references.get(branch.b) || a - b <= branch.value + 1e-8;
      });
      if (!valid) continue;
      for (const led of leds) if (!active.has(led.id)) candidate.currents.set(led.id, 0);
      if (accepted && leds.some((led) => Math.abs((accepted?.currents.get(led.id) ?? 0) - (candidate.currents.get(led.id) ?? 0)) > CURRENT_EPSILON)) ambiguous = true;
      accepted ??= candidate;
    }
    if (!accepted || ambiguous) { result.diagnostics.push(issue('unsupported-network', island)); continue; }
    for (const [node, voltage] of accepted.voltages) result.voltages.set(node, Math.abs(voltage) < 1e-12 ? 0 : voltage);
    for (const [node, reference] of accepted.references) result.references.set(node, reference);
    for (const [id, current] of accepted.currents) result.currents.set(id, Math.abs(current) < 1e-12 ? 0 : current);
  }
  return result;
}
