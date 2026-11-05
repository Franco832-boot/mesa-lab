import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { ToolSidebar } from './ToolSidebar';
import { toolTabs } from './types';
const noop = () => undefined;
describe('persistent unified tool surfaces', () => {
  it.each(toolTabs)('retains all tab panels when selecting %s', (tab) => {
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children:
      createElement(ToolSidebar, { open: true, tab, onTab: noop, onClose: noop,
        panels: { components: createElement('input', { defaultValue: 'search retained' }),
          code: createElement('textarea', { defaultValue: 'board draft retained' }), iot: 'device state retained' } }),
    }));
    expect(markup).toContain('search retained');
    expect(markup).toContain('board draft retained');
    expect(markup).toContain('device state retained');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain(`id="tool-tab-${tab}"`);
    expect((markup.match(/role="tabpanel"/g) ?? [])).toHaveLength(3);
  });
  it('collapses the surface without removing its children', () => {
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children:
      createElement(ToolSidebar, { open: false, tab: 'code', onTab: noop, onClose: noop,
        panels: { components: 'library', code: 'saved draft', iot: 'network' } }),
    }));
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('saved draft');
  });
});
