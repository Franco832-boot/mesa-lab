import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { createComponent } from '../../model/components';
import { initialSimulation } from '../simulation/runtime';
import { Workspace } from './Workspace';

const noop = () => undefined;
const props: ComponentProps<typeof Workspace> = {
  wiperPreview: null, onWiperPreview: noop, onWiperCommit: noop, controlActive: false, libraryDrag: null,
  locked: false, simulation: { ...initialSimulation(), start: noop, pause: noop, stop: noop, reset: noop,
    runFirmware: noop, stopFirmware: noop, connectDevice: noop, disconnectDevice: noop, requestHttp: noop, setGpio: noop, setButton: noop, setDht11: noop, setPotentiometer: noop },
  components: [createComponent('resistor', { x: 100, y: 80 }, 'r'),
    createComponent('breadboard', { x: 0, y: 0 }, 'bb'), createComponent('potentiometer', { x: 200, y: 80 }, 'pot'),
    createComponent('arduino-uno', { x: 200, y: 200 }, 'uno'), createComponent('esp8266', { x: 400, y: 200 }, 'esp')],
  wires: [{ id: 'w', from: { componentId: 'r', pinId: '1' }, to: { componentId: 'bb', pinId: 'a1' }, color: '#668c75', waypoints: [] }],
  viewport: { offset: { x: 10, y: -20 }, zoom: 1.2 }, onViewportChange: noop, selectedIds: ['r'], selectedWire: null,
  onSelectComponent: noop, onSelectWire: noop, onClearSelection: noop, onAdd: noop, execute: () => true,
  stageRef: { current: null }, tool: 'select', multiSelect: false, cancelEpoch: 0, autoFit: false,
  grid: true, onToggleGrid: noop, wireColor: '#668c75', connectionRequest: null,
};
const render = (extra: Partial<ComponentProps<typeof Workspace>> = {}) => renderToStaticMarkup(createElement(LocaleProvider, {
  children: createElement(Workspace, { ...props, ...extra }),
}));
describe('physical SVG layer ordering', () => {
  it('places background, wires, bodies and interactive overlays in explicit DOM order', () => {
    const markup = render();
    const layers = ['background', 'boards', 'wires', 'components', 'overlays'].map((layer) => markup.indexOf(`data-layer="${layer}"`));
    expect(layers.every((index) => index >= 0)).toBe(true);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(markup.indexOf('data-reference="bb"')).toBeLessThan(markup.indexOf('data-wire="w"'));
    expect(markup.indexOf('data-wire="w"')).toBeLessThan(markup.indexOf('data-reference="r"'));
    expect(markup.indexOf('data-selection-for="r"')).toBeGreaterThan(markup.indexOf('data-reference="pot"'));
    expect(markup.indexOf('data-reference="uno"')).toBeLessThan(markup.indexOf('data-wire="w"'));
    expect(markup.indexOf('data-reference="esp"')).toBeLessThan(markup.indexOf('data-wire="w"'));
    expect(markup.indexOf('data-testid="pot-knob"')).toBeGreaterThan(layers[4] ?? 0);
    expect((markup.match(/data-reference="/g) ?? [])).toHaveLength(5);
  });
  it('shows derived corners only for a selected wire and replaces permanent labels with accessible titles', () => {
    const initial = JSON.stringify(props.wires);
    expect(render()).not.toContain('data-waypoint=');
    const selected = render({ selectedWire: 'w', selectedIds: [] });
    expect(selected).toContain('data-waypoint=');
    expect(selected).toContain('data-segment=');
    expect(selected).not.toContain('class="reference-name"');
    expect(selected).not.toContain('class="reference-detail"');
    expect(selected).toContain('<title>Resistencia');
    expect(selected).toContain('data-wire-endpoints="w"');
    expect(JSON.stringify(props.wires)).toBe(initial);
    expect(render({ selectedWire: 'w', locked: true })).not.toContain('data-waypoint=');
  });
  it('keeps normal wire identity and annotates related wiring without changing its saved color', () => {
    const markup = render({ highlightedIds: ['r'] });
    expect(markup).toContain('diagnostic-wire');
    expect(markup).toContain('is-diagnostic');
    expect(markup).toContain('stroke="#668c75"');
    expect(props.wires[0]?.color).toBe('#668c75');
    expect(markup).toContain('pointer-events:none');
  });
});
