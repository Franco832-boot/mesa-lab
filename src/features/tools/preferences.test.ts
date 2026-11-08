import { describe, expect, it } from 'vitest';
import { clampSidebarWidth, decodeWorkspacePreferences, defaultWorkspacePreferences, sidebarWidthLimits } from './preferences';
describe('workspace preferences and resize bounds', () => {
  it('opens first-time workspaces and keeps Code wider than Components', () => {
    const initial = decodeWorkspacePreferences(null);
    expect(initial.projectsOpen).toBe(true); expect(initial.open).toBe(true); expect(initial.tab).toBe('components');
    expect(initial.widths.code).toBeGreaterThan(initial.widths.components);
  });
  it('recovers tab/collapse/per-tool width preferences without circuit or runtime data', () => {
    const saved = { ...defaultWorkspacePreferences(), tab: 'iot', open: false,
      widths: { components: 280, code: 550, iot: 440 }, snapshot: { voltage: 5 } };
    expect(decodeWorkspacePreferences(JSON.stringify(saved))).toEqual({
      open: false, projectsOpen: true, tab: 'code', widths: { components: 280, code: 550 },
    });
  });
  it('extends legacy UI preferences and respects an explicitly closed Projects library', () => {
    const legacy = JSON.stringify({ open: false, tab: 'code', widths: { components: 280, code: 550, iot: 440 } });
    const upgraded = decodeWorkspacePreferences(legacy);
    expect(upgraded.projectsOpen).toBe(true); expect(upgraded.open).toBe(false); expect(upgraded.tab).toBe('code');
    expect(upgraded.widths.code).toBe(550);
    expect(decodeWorkspacePreferences(JSON.stringify({ ...upgraded, projectsOpen: false })).projectsOpen).toBe(false);
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
