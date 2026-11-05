import type { ToolTab } from './types';
import { toolTabs } from './types';
export const WORKSPACE_PREFERENCES_KEY = 'mesa.workspace.preferences.v1';
export interface WorkspacePreferences { open: boolean; tab: ToolTab; widths: Record<ToolTab, number> }
export const defaultWorkspacePreferences = (): WorkspacePreferences => ({
  open: true, tab: 'components', widths: { components: 300, code: 480, iot: 420 },
});
export function decodeWorkspacePreferences(source: string | null): WorkspacePreferences {
  const fallback = defaultWorkspacePreferences();
  if (!source) return fallback;
  try {
    const value: unknown = JSON.parse(source);
    if (typeof value !== 'object' || value === null) return fallback;
    if ('open' in value && typeof value.open === 'boolean') fallback.open = value.open;
    if ('tab' in value) fallback.tab = toolTabs.find((tab) => tab === value.tab) ?? fallback.tab;
    if ('widths' in value && typeof value.widths === 'object' && value.widths !== null) {
      for (const tab of toolTabs) {
        const widths = value.widths;
        if (tab in widths) {
          const width = Reflect.get(widths, tab);
          if (typeof width === 'number' && Number.isFinite(width)) fallback.widths[tab] = Math.max(220, Math.min(720, width));
        }
      }
    }
    return fallback;
  } catch { return fallback; }
}
export function sidebarWidthLimits(available: number): { min: number; max: number } {
  const max = Math.max(0, Math.min(720, available * 0.48, available - 360));
  return { min: Math.min(220, max), max };
}
export function clampSidebarWidth(width: number, available: number): number {
  const limits = sidebarWidthLimits(available);
  return Math.max(limits.min, Math.min(limits.max, width));
}
