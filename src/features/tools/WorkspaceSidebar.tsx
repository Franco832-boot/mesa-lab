import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Icon } from '../../shared/Icon';
import { clampSidebarWidth, sidebarWidthLimits } from './preferences';
import { useCompactLayout } from '../../shared/useCompactLayout';
import { useLocale } from '../../locales/useLocale';

/** Shared panel shell. Tool-specific tabs and project cards stay in their owners. */
export function WorkspaceSidebar({ open, onClose, onToggle, header, children, width = 300,
  onWidth = () => undefined, canvasRef, canvasVersion, onDockChange, side = 'right', id, label,
  resizeLabel, expandLabel, toggleLabel, testId, controlPrefix = 'sidebar', expandSequence = 0, mobileTitle,
  contentHasHeading = false, collapsed = false, className = '',
}: {
  open: boolean; onClose: () => void; onToggle?: () => void; header: ReactNode; children: ReactNode;
  expandSequence?: number | undefined;
  width?: number; onWidth?: (width: number) => void; side?: 'left' | 'right';
  canvasRef?: RefObject<HTMLDivElement | null>; onDockChange?: (offset: number) => void;
  canvasVersion?: string;
  id: string; label: string; resizeLabel: string; expandLabel?: string; toggleLabel?: string;
  testId: string; controlPrefix?: string;
  mobileTitle?: string;
  contentHasHeading?: boolean; collapsed?: boolean; className?: string;
}) {
  const { t } = useLocale();
  const compact = useCompactLayout();
  const panelRef = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  useEffect(() => { if (expandSequence > 0 && compact) setMobileExpanded(true); }, [expandSequence, compact]);
  const gesture = useRef<{ pointerId: number; x: number; width: number; current: number } | null>(null);
  useEffect(() => {
    const resize = () => setAvailable(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const measure = () => {
      const parent = panelRef.current?.parentElement?.getBoundingClientRect();
      if (side === 'left') setContainerWidth(parent?.width || null);
      onDockChange?.(0);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (canvasRef?.current) observer?.observe(canvasRef.current);
    if (side === 'left' && panelRef.current?.parentElement) observer?.observe(panelRef.current.parentElement);
    return () => observer?.disconnect();
  }, [open, available, canvasRef, canvasVersion, onDockChange, side]);
  const widthBudget = side === 'left' ? (containerWidth ?? available) : available;
  const visibleWidth = resizing ?? clampSidebarWidth(width, widthBudget);
  const limits = sidebarWidthLimits(widthBudget);
  return (
    <>
      {onToggle && <div className={`tool-sidebar-rail ${open ? 'is-open' : ''}`}>
        <button type="button" className="tool-sidebar-toggle" data-testid={`${controlPrefix}-toggle`} data-workspace-tool
          aria-label={toggleLabel ?? label} title={toggleLabel ?? label}
          aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <Icon name="chevron" size={20} />
        </button>
      </div>}
      <aside ref={panelRef} id={id} className={`tool-sidebar panel tool-sidebar--${side} ${mobileExpanded ? 'is-expanded' : ''} ${collapsed ? 'is-collapsed' : ''} ${className}`}
        style={{ width: visibleWidth, flexBasis: visibleWidth }} data-testid={testId}
        aria-label={label} data-workspace-tool hidden={!open}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape' && !gesture.current) {
            event.preventDefault(); event.stopPropagation(); onClose();
          }
        }}>
        <div className="sidebar-resizer" role="separator" tabIndex={0} aria-orientation="vertical"
          data-testid={`${controlPrefix}-resizer`} aria-label={resizeLabel} aria-controls={id}
          aria-valuemin={Math.round(limits.min)} aria-valuemax={Math.round(limits.max)} aria-valuenow={Math.round(visibleWidth)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault(); event.stopPropagation(); event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            gesture.current = { pointerId: event.pointerId, x: event.clientX, width: visibleWidth, current: visibleWidth };
          }} onPointerMove={(event) => {
            const active = gesture.current;
            if (!active || active.pointerId !== event.pointerId) return;
            active.current = clampSidebarWidth(active.width + (side === 'left' ? event.clientX - active.x : active.x - event.clientX), widthBudget);
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
              : event.key === 'ArrowLeft' ? visibleWidth + (side === 'left' ? -16 : 16)
                : event.key === 'ArrowRight' ? visibleWidth + (side === 'left' ? 16 : -16) : null;
            if (next !== null) { event.preventDefault(); onWidth(clampSidebarWidth(next, widthBudget)); }
          }} />
        {!contentHasHeading && <div className="tool-sidebar-heading">
          <div className="sidebar-desktop-heading">{header}</div>
          <h2 className="mobile-panel-title">{mobileTitle ?? label}</h2>
          {expandLabel && <button className="icon-button" data-testid={`${controlPrefix}-expand`}
            title={compact && mobileExpanded ? t('minimizePanel') : expandLabel}
            aria-label={compact && mobileExpanded ? t('minimizePanel') : expandLabel} aria-expanded={compact ? mobileExpanded : visibleWidth >= limits.max - 1}
            onClick={() => {
              if (compact) setMobileExpanded((previous) => !previous);
              else onWidth(visibleWidth >= limits.max - 1 ? Math.min(300, limits.max) : limits.max);
            }}><Icon name={compact && mobileExpanded ? 'down' : 'fit'} size={18} /></button>}
          <button className="icon-button mobile-panel-close" type="button" data-testid={`${controlPrefix}-close`}
            aria-label={t('close')} title={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>}
        {children}
      </aside>
    </>
  );
}
