import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import type { ElectronicComponent } from '../../model/types';
import { PotentiometerControl } from './PotentiometerControl';
import { ComponentArtwork } from './ComponentArtwork';

const component: Extract<ElectronicComponent, { kind: 'potentiometer' }> = {
  id: 'pot-control', kind: 'potentiometer', position: { x: 10, y: 20 }, rotation: 0,
  properties: { resistance: 10000, ratio: 0.5 },
};
const render = (ratio: number, disabled = false) => {
  const onPreview = vi.fn(), onCommit = vi.fn();
  const markup = renderToStaticMarkup(createElement(LocaleProvider, null,
    createElement('svg', null, createElement(PotentiometerControl, { component, ratio, disabled, onPreview, onCommit })),
  ));
  return { markup, onPreview, onCommit };
};
describe('direct potentiometer control rendering', () => {
  it('exposes its real local knob center, accessible percent and visible position', () => {
    const { markup, onPreview, onCommit } = render(0.25);
    expect(markup).toContain('data-component-control="potentiometer"');
    expect(markup).toContain('transform="translate(20 17.5)"');
    expect(markup).toContain('role="slider"');
    expect(markup).toContain('aria-valuemin="0"');
    expect(markup).toContain('aria-valuemax="100"');
    expect(markup).toContain('aria-valuenow="25"');
    expect(markup).toContain('data-testid="pot-position"');
    expect(markup).toContain('25');
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
  it('lets disabled controls pass pointer events to the workspace and leaves tab order', () => {
    const { markup } = render(1, true);
    expect(markup).toContain('pointer-events="none"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('aria-valuenow="100"');
  });
  it('keeps the existing physical knob drawing while rendering the controlled sweep', () => {
    const draw = (wiperRatio: number) => renderToStaticMarkup(createElement(ComponentArtwork, {
      kind: 'potentiometer', properties: component.properties, wiperRatio,
    }));
    expect(draw(0)).toContain('rotate(-135 45 40)');
    expect(draw(0.5)).toContain('rotate(0 45 40)');
    expect(draw(1)).toContain('rotate(135 45 40)');
  });
});
