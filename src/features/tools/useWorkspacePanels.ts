import { useEffect, useState } from 'react';
import { useCompactLayout } from '../../shared/useCompactLayout';
import { useWorkspaceTools } from './useWorkspaceTools';
import type { ToolTab } from './types';

export type MobilePanel = 'projects' | 'components' | 'code' | 'inspector';
type Visibility = boolean | ((previous: boolean) => boolean);

/** Mobile visibility is exclusive and transient; desktop preferences stay independent. */
export function useWorkspacePanels() {
  const tools = useWorkspaceTools();
  const compact = useCompactLayout();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | null>(null);
  useEffect(() => setMobilePanel(null), [compact]);
  const toolsOpen = mobilePanel === 'components' || mobilePanel === 'code';
  const setOpen = (value: Visibility) => {
    if (!compact) { tools.setOpen(value); return; }
    setMobilePanel((previous) => {
      const wasOpen = previous === 'components' || previous === 'code';
      const open = typeof value === 'boolean' ? value : value(wasOpen);
      return open ? (wasOpen ? previous : tools.tab) : wasOpen ? null : previous;
    });
  };
  const setProjectsOpen = (value: Visibility) => {
    if (!compact) { tools.setProjectsOpen(value); return; }
    setMobilePanel((previous) => {
      const open = typeof value === 'boolean' ? value : value(previous === 'projects');
      return open ? 'projects' : previous === 'projects' ? null : previous;
    });
  };
  const setTab = (tab: ToolTab) => {
    tools.setTab(tab);
    if (compact) setMobilePanel(tab);
  };
  return {
    ...tools, compact, mobilePanel, setMobilePanel,
    open: compact ? toolsOpen : tools.open,
    projectsOpen: compact ? mobilePanel === 'projects' : tools.projectsOpen,
    tab: compact && (mobilePanel === 'components' || mobilePanel === 'code') ? mobilePanel : tools.tab,
    setOpen, setProjectsOpen, setTab,
  };
}
