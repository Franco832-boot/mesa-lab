import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { toolLabels, toolTabs } from './types';
import type { ToolTab } from './types';
import { clampSidebarWidth, sidebarWidthLimits } from './preferences';

export function ToolSidebar({ open, tab, onTab, onClose, panels, width = 300, onWidth = () => undefined, canvasRef, onDockChange }: {
  open: boolean; tab: ToolTab; onTab: (tab: ToolTab) => void; onClose: () => void;
  panels: Record<ToolTab, ReactNode>; width?: number; onWidth?: (width: number) => void;
  canvasRef?: RefObject<HTMLDivElement | null>; onDockChange?: (offset: number) => void;
}) {
  const { t } = useLocale();
  const panelRef = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [resizing, setResizing] = useState<number | null>(null);
  const [bottomInset, setBottomInset] = useState(0);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const gesture = useRef<{ pointerId: number; x: number; width: number; current: number } | null>(null);
  useEffect(() => {
    const resize = () => setAvailable(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const measure = () => {
      const stage = canvasRef?.current?.getBoundingClientRect(), panel = panelRef.current?.getBoundingClientRect();
      const parent = panelRef.current?.parentElement?.getBoundingClientRect();
      setBottomInset(available <= 760 && stage && parent ? Math.max(0, parent.bottom - stage.bottom) : 0);
      onDockChange?.(open && available <= 760 && stage && panel
        ? Math.max(0, Math.min(stage.height - 44, stage.bottom - panel.top + 12)) : 0);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (canvasRef?.current) observer?.observe(canvasRef.current);
    return () => observer?.disconnect();
  }, [open, available, mobileExpanded, bottomInset, canvasRef, onDockChange]);
  const visibleWidth = resizing ?? clampSidebarWidth(width, available);
  const limits = sidebarWidthLimits(available);
  const tabs = useRef<Partial<Record<ToolTab, HTMLButtonElement>>>({});
  return (
    <aside ref={panelRef} id="workspace-tools" className={`tool-sidebar panel ${mobileExpanded ? 'is-expanded' : ''}`}
      style={{ width: visibleWidth, flexBasis: visibleWidth,
        ...(available <= 760 ? { bottom: bottomInset, maxHeight: `calc(100% - ${bottomInset + 148}px)` } : {}) }} data-testid="tool-sidebar"
      aria-label={t('workspaceTools')} data-workspace-tool hidden={!open}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && !gesture.current) {
          event.preventDefault(); event.stopPropagation(); onClose();
        }
      }}>
      <div className="sidebar-resizer" role="separator" tabIndex={0} aria-orientation="vertical"
        data-testid="sidebar-resizer" aria-label={t('resizeTools')} aria-controls="workspace-tools"
        aria-valuemin={Math.round(limits.min)} aria-valuemax={Math.round(limits.max)} aria-valuenow={Math.round(visibleWidth)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { pointerId: event.pointerId, x: event.clientX, width: visibleWidth, current: visibleWidth };
        }} onPointerMove={(event) => {
          const active = gesture.current;
          if (!active || active.pointerId !== event.pointerId) return;
          active.current = clampSidebarWidth(active.width + active.x - event.clientX, available);
          setResizing(active.current);
        }} onPointerUp={(event) => {
          const active = gesture.current;
          if (!active || active.pointerId !== event.pointerId) return;
          gesture.current = null; onWidth(active.current); setResizing(null);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }} onPointerCancel={() => { gesture.current = null; setResizing(null); }}
        onLostPointerCapture={() => { gesture.current = null; setResizing(null); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && gesture.current) {
            event.preventDefault(); event.stopPropagation();
            const pointerId = gesture.current.pointerId; gesture.current = null; setResizing(null);
            if (event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.releasePointerCapture(pointerId);
            return;
          }
          const next = event.key === 'Home' ? limits.min : event.key === 'End' ? limits.max
            : event.key === 'ArrowLeft' ? visibleWidth + 16 : event.key === 'ArrowRight' ? visibleWidth - 16 : null;
          if (next !== null) { event.preventDefault(); onWidth(clampSidebarWidth(next, available)); }
        }} />
      <div className="tool-sidebar-heading">
        <div className="tool-sidebar-tabs" role="tablist" aria-label={t('workspaceTools')}>
          {toolTabs.map((item, index) => (
            <button key={item} id={`tool-tab-${item}`} data-testid={`tool-tab-${item}`}
              role="tab" type="button" aria-selected={tab === item} aria-controls={`tool-panel-${item}`}
              tabIndex={tab === item ? 0 : -1} ref={(node) => { if (node) tabs.current[item] = node; }}
              onClick={() => onTab(item)} onKeyDown={(event) => {
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? toolTabs.length - 1
                  : event.key === 'ArrowRight' ? (index + 1) % toolTabs.length
                    : event.key === 'ArrowLeft' ? (index + toolTabs.length - 1) % toolTabs.length : null;
                const target = next === null ? undefined : toolTabs[next];
                if (target) { event.preventDefault(); onTab(target); tabs.current[target]?.focus(); }
              }}>{t(toolLabels[item])}</button>
          ))}
        </div>
        <button className="icon-button" data-testid="sidebar-expand" aria-label={t('expandTools')} aria-expanded={available <= 760 ? mobileExpanded : visibleWidth >= limits.max - 1}
          onClick={() => {
            if (available <= 760) setMobileExpanded((previous) => !previous);
            else onWidth(visibleWidth >= limits.max - 1 ? Math.min(300, limits.max) : limits.max);
          }}><Icon name="plus" size={15} /></button>
        <button className="icon-button" data-testid="sidebar-close" aria-label={t('collapseTools')}
          onClick={onClose}><Icon name="chevron" size={16} /></button>
      </div>
      {toolTabs.map((item) => (
        <div key={item} id={`tool-panel-${item}`} role="tabpanel" aria-labelledby={`tool-tab-${item}`}
          className="tool-sidebar-content" hidden={tab !== item}>{panels[item]}</div>
      ))}
    </aside>
  );
}
