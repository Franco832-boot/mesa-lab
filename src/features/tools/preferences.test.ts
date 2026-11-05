import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, decodeWorkspacePreferences, defaultWorkspacePreferences, sidebarWidthLimits } from './preferences';
describe('workspace preferences and resize bounds', () => {
  it('opens first-time workspaces and keeps Code wider than Components', () => {
    const initial = decodeWorkspacePreferences(null);
    expect(initial.open).toBe(true); expect(initial.tab).toBe('components');
    expect(initial.widths.code).toBeGreaterThan(initial.widths.components);
  });
  it('recovers tab/collapse/per-tool width preferences without circuit or runtime data', () => {
    const saved = { ...defaultWorkspacePreferences(), tab: 'iot', open: false,
      widths: { components: 280, code: 550, iot: 440 }, snapshot: { voltage: 5 } };
    expect(decodeWorkspacePreferences(JSON.stringify(saved))).toEqual({
      open: false, tab: 'iot', widths: { components: 280, code: 550, iot: 440 },
    });
  });
  it.each([761, 1000, 1440, 2000])('preserves the main canvas at %spx', (available) => {
    const bounds = sidebarWidthLimits(available);
    expect(clampSidebarWidth(9999, available)).toBe(bounds.max);
    expect(available - bounds.max).toBeGreaterThanOrEqual(360);
    expect(bounds.max).toBeLessThan(available / 2);
    expect(clampSidebarWidth(0, available)).toBe(bounds.min);
  });
  it('rejects invalid data and bounds imported widths', () => {
    expect(decodeWorkspacePreferences('{')).toEqual(defaultWorkspacePreferences());
    expect(decodeWorkspacePreferences('{"tab":"unknown","widths":{"code":99999}}').widths.code).toBe(720);
  });
});
