import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Icon } from '../../shared/Icon';
import { clampSidebarWidth, sidebarWidthLimits } from './preferences';

/** Shared panel shell. Tool-specific tabs and project cards stay in their owners. */
export function WorkspaceSidebar({ open, onClose, onToggle, header, children, width = 300,
  onWidth = () => undefined, canvasRef, canvasVersion, onDockChange, side = 'right', id, label,
  resizeLabel, expandLabel, toggleLabel, testId, controlPrefix = 'sidebar',
}: {
  open: boolean; onClose: () => void; onToggle?: () => void; header: ReactNode; children: ReactNode;
  width?: number; onWidth?: (width: number) => void; side?: 'left' | 'right';
  canvasRef?: RefObject<HTMLDivElement | null>; onDockChange?: (offset: number) => void;
  canvasVersion?: string;
  id: string; label: string; resizeLabel: string; expandLabel?: string; toggleLabel?: string;
  testId: string; controlPrefix?: string;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [maxSheetHeight, setMaxSheetHeight] = useState<number | null>(null);
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
      if (side === 'left') setContainerWidth(parent?.width || null);
      setMaxSheetHeight(stage ? Math.max(44, stage.height - 44) : null);
      setBottomInset(available <= 760 && stage && parent ? Math.max(0, parent.bottom - stage.bottom) : 0);
      onDockChange?.(side === 'right' && open && available <= 760 && stage && panel
        ? Math.max(0, Math.min(stage.height - 44, stage.bottom - panel.top + 12)) : 0);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (canvasRef?.current) observer?.observe(canvasRef.current);
    if (side === 'left' && panelRef.current?.parentElement) observer?.observe(panelRef.current.parentElement);
    return () => observer?.disconnect();
  }, [open, available, mobileExpanded, bottomInset, canvasRef, canvasVersion, onDockChange, side]);
  const widthBudget = side === 'left' ? (containerWidth ?? available) : available;
  const visibleWidth = resizing ?? clampSidebarWidth(width, widthBudget);
  const limits = sidebarWidthLimits(widthBudget);
  const sheet = available <= 760 && side === 'right';
  const sheetLimit = maxSheetHeight === null ? `calc(100% - ${bottomInset + 148}px)`
    : `min(calc(100% - ${bottomInset + 148}px), ${maxSheetHeight}px)`;
  return (
    <>
      {onToggle && <div className={`tool-sidebar-rail ${open ? 'is-open' : ''} ${mobileExpanded ? 'is-expanded' : ''}`}
        style={sheet && open ? { bottom: bottomInset, maxHeight: sheetLimit } : undefined}>
        <button type="button" className="tool-sidebar-toggle" data-testid={`${controlPrefix}-toggle`} data-workspace-tool
          aria-label={toggleLabel ?? label} title={toggleLabel ?? label}
          aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <Icon name="chevron" size={20} />
        </button>
      </div>}
      <aside ref={panelRef} id={id} className={`tool-sidebar panel tool-sidebar--${side} ${mobileExpanded ? 'is-expanded' : ''}`}
        style={{ width: visibleWidth, flexBasis: visibleWidth,
          ...(sheet ? { bottom: bottomInset, maxHeight: sheetLimit } : {}) }} data-testid={testId}
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
        <div className="tool-sidebar-heading">
          {header}
          {expandLabel && <button className="icon-button" data-testid={`${controlPrefix}-expand`} aria-label={expandLabel} aria-expanded={available <= 760 ? mobileExpanded : visibleWidth >= limits.max - 1}
            onClick={() => {
              if (available <= 760) setMobileExpanded((previous) => !previous);
              else onWidth(visibleWidth >= limits.max - 1 ? Math.min(300, limits.max) : limits.max);
            }}><Icon name="plus" size={15} /></button>}
        </div>
        {children}
      </aside>
    </>
  );
}
