import { useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useLocale } from '../../locales/useLocale';
import { toolLabels, toolTabs } from './types';
import type { ToolTab } from './types';
import { WorkspaceSidebar } from './WorkspaceSidebar';

export function ToolSidebar({ open, tab, onTab, onClose, onToggle, panels, width = 300, onWidth, canvasRef, canvasVersion, onDockChange, expandSequence }: {
  open: boolean; tab: ToolTab; onTab: (tab: ToolTab) => void; onClose: () => void; onToggle: () => void;
  panels: Record<ToolTab, ReactNode>; width?: number; onWidth?: (width: number) => void;
  canvasRef?: RefObject<HTMLDivElement | null>; onDockChange?: (offset: number) => void;
  canvasVersion?: string; expandSequence?: number;
}) {
  const { t } = useLocale();
  const tabs = useRef<Partial<Record<ToolTab, HTMLButtonElement>>>({});
  return <WorkspaceSidebar expandSequence={expandSequence} open={open} onClose={onClose} onToggle={onToggle}
    id="workspace-tools" label={t('workspaceTools')} testId="tool-sidebar"
    mobileTitle={t(toolLabels[tab])}
    resizeLabel={t('resizeTools')} expandLabel={t('expandTools')} toggleLabel={t('toggleTools')}
    width={width} {...(onWidth ? { onWidth } : {})} {...(canvasRef ? { canvasRef } : {})}
    {...(canvasVersion ? { canvasVersion } : {})}
    {...(onDockChange ? { onDockChange } : {})}
    header={<div className="tool-sidebar-tabs" role="tablist" aria-label={t('workspaceTools')}>
      {toolTabs.map((item, index) => <button key={item} id={`tool-tab-${item}`} data-testid={`tool-tab-${item}`}
        role="tab" type="button" aria-selected={tab === item} aria-controls={`tool-panel-${item}`}
        tabIndex={tab === item ? 0 : -1} ref={(node) => { if (node) tabs.current[item] = node; }}
        onClick={() => onTab(item)} onKeyDown={(event) => {
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? toolTabs.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % toolTabs.length
              : event.key === 'ArrowLeft' ? (index + toolTabs.length - 1) % toolTabs.length : null;
          const target = next === null ? undefined : toolTabs[next];
          if (target) { event.preventDefault(); onTab(target); tabs.current[target]?.focus(); }
        }}>{t(toolLabels[item])}</button>)}
    </div>}>
    {toolTabs.map((item) => <div key={item} id={`tool-panel-${item}`} role="tabpanel" aria-labelledby={`tool-tab-${item}`}
      className="tool-sidebar-content" hidden={tab !== item}>{panels[item]}</div>)}
  </WorkspaceSidebar>;
}
