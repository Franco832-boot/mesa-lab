import { useEffect, useState } from 'react';
import { decodeWorkspacePreferences, WORKSPACE_PREFERENCES_KEY } from './preferences';
import type { ToolTab } from './types';
export function useWorkspaceTools() {
  const [preferences, setPreferences] = useState(() => {
    try { return decodeWorkspacePreferences(localStorage.getItem(WORKSPACE_PREFERENCES_KEY)); }
    catch { return decodeWorkspacePreferences(null); }
  });
  useEffect(() => {
    try {
      const source = JSON.stringify(preferences);
      if (localStorage.getItem(WORKSPACE_PREFERENCES_KEY) !== source) localStorage.setItem(WORKSPACE_PREFERENCES_KEY, source);
    }
    catch { /* Preferences remain usable for this session. */ }
  }, [preferences]);
  return {
    ...preferences,
    setProjectsOpen: (value: boolean | ((previous: boolean) => boolean)) => setPreferences((previous) => {
      const projectsOpen = typeof value === 'boolean' ? value : value(previous.projectsOpen);
      return projectsOpen === previous.projectsOpen ? previous : { ...previous, projectsOpen };
    }),
    setOpen: (value: boolean | ((previous: boolean) => boolean)) => setPreferences((previous) => {
      const open = typeof value === 'boolean' ? value : value(previous.open);
      return open === previous.open ? previous : { ...previous, open };
    }),
    setTab: (tab: ToolTab) => setPreferences((previous) => previous.tab === tab && previous.open ? previous : { ...previous, tab, open: true }),
    setWidth: (width: number) => setPreferences((previous) => ({ ...previous,
      widths: { ...previous.widths, [previous.tab]: width } })),
  };
}
