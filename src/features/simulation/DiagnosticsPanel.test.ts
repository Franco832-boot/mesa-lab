import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { es } from '../../locales/es/messages';
import { en } from '../../locales/en/messages';
import { createComponent } from '../../model/components';
import type { ElectronicComponent } from '../../model/types';
import type { SimulationIssue } from '../../sim/types';
import { DiagnosticsPanel } from './DiagnosticsPanel';

const resistor = createComponent('resistor', { x: 0, y: 0 }, 'r1');
const overload: SimulationIssue = { code: 'resistor-overpower', severity: 'warning', componentIds: ['r1'], pinIds: ['1', '2'] };
const render = (diagnostics: readonly SimulationIssue[], components: readonly ElectronicComponent[] = [resistor]) => {
  const onNavigate = vi.fn();
  const markup = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(DiagnosticsPanel, { diagnostics, components, onNavigate }) }));
  return { markup, onNavigate };
};
afterEach(() => vi.unstubAllGlobals());
describe('actionable electrical diagnostics panel', () => {
  it.each(['es', 'en'] as const)('renders what, why, action, related parts and details in %s', (locale) => {
    vi.stubGlobal('localStorage', { getItem: () => locale });
    const dictionary = locale === 'es' ? es : en;
    const { markup, onNavigate } = render([overload]);
    expect(markup).toContain(dictionary.diagnosticResistorPower);
    expect(markup).toContain(dictionary.diagnosticWhy);
    expect(markup).toContain(dictionary.diagnosticAction);
    expect(markup).toContain(dictionary.diagnosticWhyResistorPower);
    expect(markup).toContain(`${dictionary.resistor_name} · r1`);
    expect(markup).toContain('<details');
    expect(markup).toContain('data-code="resistor-overpower"');
    expect(markup).toContain('data-severity="warning"');
    expect(markup).toContain('data-testid="diagnostic-navigate"');
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it('shows one card with a repeat count for duplicated evidence', () => {
    const { markup } = render([overload, overload]);
    expect(markup.match(/data-code="resistor-overpower"/g)).toHaveLength(1);
    expect(markup).toContain(es.diagnosticRepeated);
    expect(markup).toContain(': 2');
  });
  it('retains missing IDs as technical evidence without offering a dead navigation control', () => {
    const { markup } = render([{ code: 'invalid-reference', severity: 'error', componentIds: ['missing'], pinIds: ['unknown'] }]);
    expect(markup).toContain('missing');
    expect(markup).toContain('unknown');
    expect(markup).not.toContain('diagnostic-navigate');
  });
  it('renders the existing empty diagnostic message', () => {
    const { markup } = render([]);
    expect(markup).toContain(es.diagnosticsEmpty);
    expect(markup).not.toContain('diagnostic-card');
  });
});
