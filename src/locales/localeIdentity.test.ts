import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from './LocaleProvider';
import { useLocale } from './useLocale';

const consumer = (read: typeof useLocale) => function Consumer() {
  return createElement('span', null, read().t('library'));
};
describe('locale context identity', () => {
  it('supports provider and consumer modules evaluated at different times', async () => {
    const refreshed = await vi.importActual<typeof import('./useLocale')>('./useLocale?locale-refresh');
    const html = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(consumer(refreshed.useLocale)) }));
    expect(html).toMatch(/Componentes|Components/);
  });
  it('retains the missing-provider guard instead of masking configuration errors', () => {
    expect(() => renderToStaticMarkup(createElement(consumer(useLocale)))).toThrow('LocaleProvider is required');
  });
});
