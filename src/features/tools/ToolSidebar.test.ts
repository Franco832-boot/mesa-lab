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
      createElement(ToolSidebar, { open: true, tab, onTab: noop, onClose: noop, onToggle: noop,
        panels: { components: createElement('input', { defaultValue: 'search retained' }),
          code: createElement('textarea', { defaultValue: 'board draft retained' }) } }),
    }));
    expect(markup).toContain('search retained');
    expect(markup).toContain('board draft retained');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain(`id="tool-tab-${tab}"`);
    expect(markup).not.toContain('data-testid="sidebar-close"');
    expect((markup.match(/role="tabpanel"/g) ?? [])).toHaveLength(2);
  });
  it('collapses the surface without removing its children', () => {
    const markup = renderToStaticMarkup(createElement(LocaleProvider, { children:
      createElement(ToolSidebar, { open: false, tab: 'code', onTab: noop, onClose: noop, onToggle: noop,
        panels: { components: 'library', code: 'saved draft' } }),
    }));
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('saved draft');
    const toggle = markup.match(/<button\b[^>]*data-testid="sidebar-toggle"[^>]*>/)?.[0];
    expect(toggle).toContain('aria-expanded="false"');
    expect(toggle).toContain('aria-controls="workspace-tools"');
    expect(toggle).not.toContain('hidden');
    expect(markup.indexOf('data-testid="sidebar-toggle"')).toBeLessThan(markup.indexOf('<aside'));
    expect(markup).toContain('aria-selected="true"');
  });
});
