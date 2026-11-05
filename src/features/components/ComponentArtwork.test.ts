import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComponentArtwork } from './ComponentArtwork';
import type { ComponentResult } from '../../sim/types';
import { evaluateCircuit } from '../../sim/engine';
import { createProject } from '../../model/project';
import { createComponent } from '../../model/components';

const led = (result?: ComponentResult) => renderToStaticMarkup(createElement(ComponentArtwork, {
  kind: 'led', properties: { color: 'red' }, ...(result ? { result } : {}),
}));
const glowOpacity = (markup: string) => markup.match(/data-testid="led-glow"[^>]*opacity="([^"]+)"/)?.[1];
describe('result-driven physical artwork', () => {
  it('renders no emission without solved brightness, even with active condition or current', () => {
    expect(glowOpacity(led())).toBe('0');
    expect(glowOpacity(led({ condition: 'active', current: 0.01 }))).toBe('0');
  });
  it('uses the electrical engine brightness and resets to unpowered artwork', () => {
    const project = { ...createProject('svg'), components: [
      createComponent('power-supply', { x: 0, y: 0 }, 's'),
      createComponent('resistor', { x: 100, y: 0 }, 'r'),
      createComponent('led', { x: 200, y: 0 }, 'l'),
    ], wires: [
      { id: '1', from: { componentId: 's', pinId: 'positive' }, to: { componentId: 'r', pinId: '1' }, color: '#000000', waypoints: [] },
      { id: '2', from: { componentId: 'r', pinId: '2' }, to: { componentId: 'l', pinId: 'anode' }, color: '#000000', waypoints: [] },
      { id: '3', from: { componentId: 'l', pinId: 'cathode' }, to: { componentId: 's', pinId: 'negative' }, color: '#000000', waypoints: [] },
    ] };
    const result = evaluateCircuit(project).components.l;
    expect(Number(glowOpacity(led(result)))).toBeCloseTo((3 / 330) / 0.02, 10);
    expect(led(result)).toContain('data-condition="active"');
    project.wires.pop();
    expect(glowOpacity(led(evaluateCircuit(project).components.l))).toBe('0');
    expect(glowOpacity(led())).toBe('0');
  });
  it('renders the supplied overload condition without inferring heating from configured resistance', () => {
    const render = (condition: ComponentResult['condition']) => renderToStaticMarkup(createElement(ComponentArtwork, {
      kind: 'resistor', properties: { resistance: 10 }, result: { condition },
    }));
    expect(render('normal')).toContain('data-condition="normal"');
    expect(render('overheated')).toContain('data-condition="overheated"');
    expect(render('overheated')).toContain('class="resistor-body"');
    expect(render('normal')).not.toContain('data-condition="damaged"');
  });
});
