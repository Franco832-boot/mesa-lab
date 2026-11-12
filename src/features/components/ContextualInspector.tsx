import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ElectronicComponent, Viewport, Wire } from '../../model/types';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { inspectorAnchor, placeInspector } from './inspectorPlacement';
import { useCompactLayout } from '../../shared/useCompactLayout';
import { WorkspaceSidebar } from '../tools/WorkspaceSidebar';

interface ContextualInspectorProps {
  components: readonly ElectronicComponent[];
  wires: readonly Wire[];
  viewport: Viewport;
  componentId: string | null;
  wireId: string | null;
  stageRef: RefObject<HTMLDivElement | null>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  onSheetDockChange: (offset: number) => void;
  children: (collapseButton: ReactNode, close: () => void) => ReactNode;
}
/** Nonmodal surface: only the panel receives pointer events; the canvas stays live. */
export function ContextualInspector({
  components, wires, viewport, componentId, wireId, stageRef, collapsed, onToggleCollapse, onClose, onSheetDockChange, children,
}: ContextualInspectorProps) {
  const { t } = useLocale();
  const panel = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });
  const [naturalHeight, setNaturalHeight] = useState<number>();
  const [headingHeight, setHeadingHeight] = useState(64);
  const mobile = useCompactLayout();
  useEffect(() => {
    if (mobile) return;
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const bounds = stage.getBoundingClientRect();
      setCanvas((previous) => previous.width === bounds.width && previous.height === bounds.height
        ? previous : { width: bounds.width, height: bounds.height });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(stage);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [stageRef, mobile]);
  useLayoutEffect(() => {
    const surface = panel.current?.querySelector('.inspector-panel');
    const heading = surface?.querySelector('.panel-heading');
    const scroll = surface?.querySelector('.inspector-scroll');
    const content = scroll?.querySelector('[data-inspector-content]');
    if (!surface || !heading || !scroll || !content) return;
    const measure = () => {
      if (surface.getBoundingClientRect().width <= 0) return;
      const panelStyles = panel.current ? window.getComputedStyle(panel.current) : null;
      const chromeHeight = parseFloat(panelStyles?.paddingTop || '0') + parseFloat(panelStyles?.paddingBottom || '0') + 2;
      const measuredHeading = Math.ceil(heading.getBoundingClientRect().height + chromeHeight);
      setHeadingHeight((previous) => previous === measuredHeading ? previous : measuredHeading);
      if (collapsed) return;
      const styles = window.getComputedStyle(scroll);
      let height = content.getBoundingClientRect().height + parseFloat(styles.paddingTop || '0') + parseFloat(styles.paddingBottom || '0') + chromeHeight;
      for (const child of surface.children) {
        if (child === scroll) continue;
        const style = window.getComputedStyle(child);
        height += child.getBoundingClientRect().height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
      }
      const measured = Math.ceil(height);
      setNaturalHeight((previous) => previous === measured ? previous : measured);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(content);
    for (const child of surface.children) if (child !== scroll) observer?.observe(child);
    return () => observer?.disconnect();
  }, [componentId, wireId, collapsed, canvas.width, canvas.height, mobile]);
  const anchor = useMemo(() => inspectorAnchor(components, wires, viewport, componentId, wireId),
    [components, wires, viewport, componentId, wireId]);
  const rect = useMemo(() => anchor && !mobile ? placeInspector(canvas, anchor, collapsed, false, collapsed ? headingHeight : naturalHeight) : null,
    [canvas, anchor, collapsed, mobile, headingHeight, naturalHeight]);
  useEffect(() => {
    onSheetDockChange(0);
  }, [onSheetDockChange]);
  useEffect(() => () => onSheetDockChange(0), [onSheetDockChange]);
  const close = () => {
    const restoreFocus = panel.current?.contains(document.activeElement);
    onClose();
    if (restoreFocus) requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }));
  };
  const collapseButton = (
    <button className="icon-button" type="button" data-testid="inspector-expand"
      aria-label={t(collapsed ? 'expandInspector' : 'collapseInspector')}
      title={t(collapsed ? 'expandInspector' : 'collapseInspector')}
      aria-expanded={!collapsed} aria-controls="context-inspector-body"
      onClick={onToggleCollapse}>
      <Icon name={collapsed ? 'chevron' : 'down'} size={16} />
    </button>
  );
  if (mobile) return (
    <WorkspaceSidebar open onClose={close} id="context-inspector" testId="context-inspector"
      label={t('contextualInspector')} resizeLabel={t('properties')} header={null} contentHasHeading
      collapsed={collapsed} className="mobile-inspector-sheet" controlPrefix="inspector">
      {children(collapseButton, close)}
    </WorkspaceSidebar>
  );
  if (!rect) return null;
  return (
    <div className="inspector-overlay">
      <div ref={panel} id="context-inspector" data-testid="context-inspector"
        role="region" aria-label={t('contextualInspector')} tabIndex={-1}
        data-layout="floating"
        className={`floating-inspector ${collapsed ? 'is-collapsed' : ''}`}
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height,
          visibility: canvas.width > 0 && canvas.height > 0 ? 'visible' : 'hidden' }}
        onWheel={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}>
        {children(collapseButton, close)}
      </div>
    </div>
  );
}
