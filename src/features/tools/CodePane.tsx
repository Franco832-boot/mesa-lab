import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocale } from '../../locales/useLocale';
const clamp = (value: number) => Math.max(25, Math.min(70, value));

/** A dock in the main workspace; resizing never reparents or remounts the circuit. */
export function CodePane({ visible, children }: { visible: boolean; children: ReactNode }) {
  const { t } = useLocale();
  const [size, setSize] = useState(60);
  const [preview, setPreview] = useState<number | null>(null);
  const gesture = useRef<{ pointer: number; y: number; size: number; available: number; current: number } | null>(null);
  const value = preview ?? size;
  return <section className="code-editor-pane" data-testid="code-editor-pane" hidden={!visible} data-workspace-tool
    style={{ flexBasis: `${value}%`, height: `${value}%` }}>
    <div role="separator" tabIndex={0} aria-orientation="horizontal" aria-label={t('codeResize')}
      aria-valuemin={25} aria-valuemax={70} aria-valuenow={Math.round(value)} className="code-pane-resizer" data-testid="code-pane-resizer"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = { pointer: event.pointerId, y: event.clientY, size, available: event.currentTarget.parentElement?.parentElement?.clientHeight || 1, current: size };
      }} onPointerMove={(event) => {
        const current = gesture.current;
        if (current?.pointer !== event.pointerId) return;
        current.current = clamp(current.size + (current.y - event.clientY) / current.available * 100); setPreview(current.current);
      }} onPointerUp={(event) => {
        const current = gesture.current;
        if (current?.pointer !== event.pointerId) return;
        gesture.current = null; setSize(current.current); setPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { gesture.current = null; setPreview(null); }}
      onLostPointerCapture={() => { gesture.current = null; setPreview(null); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && gesture.current) {
          const pointer = gesture.current.pointer; gesture.current = null; setPreview(null);
          if (event.currentTarget.hasPointerCapture(pointer)) event.currentTarget.releasePointerCapture(pointer);
          event.preventDefault(); event.stopPropagation(); return;
        }
        const next = event.key === 'ArrowUp' ? size + 5 : event.key === 'ArrowDown' ? size - 5 : event.key === 'Home' ? 25 : event.key === 'End' ? 70 : null;
        if (next !== null) { event.preventDefault(); event.stopPropagation(); setSize(clamp(next)); }
      }} />
    {children}
  </section>;
}
