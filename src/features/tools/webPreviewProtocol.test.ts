import { describe, expect, it } from 'vitest';
import { PreviewBudget, previewMessage, virtualResourcePath, WEB_LIMITS } from './webPreviewProtocol';
const token = 'a'.repeat(32);
const valid = { type: 'preview-http', token, id: 1, path: '/led/on' };
describe('web capability protocol', () => {
  it('accepts only exact local GET capability messages and bounded errors', () => {
    expect(previewMessage(valid, token)).toEqual(valid);
    for (const value of [null, [], { ...valid, token: 'old' }, { ...valid, componentId: 'other' }, { ...valid, method: 'POST' },
      { ...valid, id: Infinity }, { ...valid, id: -1 }, { ...valid, id: '1' }, { ...valid, path: 'http://192.0.2.10/' },
      { ...valid, path: '//localhost/' }, { ...valid, path: '/..' }, { ...valid, path: '/%2e%2e' }, { ...valid, path: 'data:text/plain,hi' },
      { ...valid, path: 'javascript:alert(1)' }, { ...valid, type: 'redux' }, { ...valid, path: '/' + 'x'.repeat(WEB_LIMITS.path) }]) expect(previewMessage(value, token)).toBeNull();
    expect(previewMessage({ type: 'preview-error', token, text: 'x'.repeat(513) }, token)).toBeNull();
  });
  it('enforces per-second and total budgets independently', () => {
    const budget = new PreviewBudget(2, 3);
    expect(budget.take(0)).toBe(true); expect(budget.take(1)).toBe(true); expect(budget.take(2)).toBe(false);
    expect(budget.take(1000)).toBe(true); expect(budget.take(1001)).toBe(false);
  });
  it('resolves local resources relative to the current served route, with no URL/network fallback', () => {
    expect(virtualResourcePath('theme.css', '/pages/index')).toBe('/pages/theme.css');
    expect(virtualResourcePath('/app.js', '/pages/index')).toBe('/app.js');
    for (const path of ['../other.js', 'blob:null/a', '/api?x=1', 'http://localhost/a', '//localhost/a']) expect(() => virtualResourcePath(path)).toThrow('400');
  });
});
