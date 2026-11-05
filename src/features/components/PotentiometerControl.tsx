import { useEffect, useRef } from 'react';
import type { ElectronicComponent, Point } from '../../model/types';
import { artworkPointToLocal } from '../../model/physical';
import {
  advancePotentiometerRatio,
  advancePotentiometerVerticalRatio,
  clampPotentiometerRatio,
  potentiometerPointerAngle,
} from '../../model/potentiometer';
import { useLocale } from '../../locales/useLocale';

interface PotentiometerControlProps {
  component: Extract<ElectronicComponent, { kind: 'potentiometer' }>;
  ratio: number;
  disabled: boolean;
  onPreview: (ratio: number | null) => void;
  onCommit: (ratio: number) => void;
}
interface KnobGesture {
  pointerId: number;
  ratio: number;
  angle: number | null;
  point: Point | null;
  vertical: boolean;
}
const center = artworkPointToLocal('potentiometer', { x: 45, y: 40 });

/** Mechanical SVG control. The parent owns previews/commits; the engine owns electrical behavior. */
export function PotentiometerControl({
  component,
  ratio,
  disabled,
  onPreview,
  onCommit,
}: PotentiometerControlProps) {
  const { t, locale } = useLocale();
  const control = useRef<SVGGElement>(null);
  const gesture = useRef<KnobGesture | null>(null);
  const callbacks = useRef({ onPreview, onCommit });
  callbacks.current = { onPreview, onCommit };
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
  const pointAt = (clientX: number, clientY: number): Point | null => {
    const matrix = control.current?.getScreenCTM();
    if (!matrix) return null;
    try {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    } catch {
      return null;
    }
  };
  const cancel = () => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    callbacks.current.onPreview(null);
    if (control.current?.hasPointerCapture(active.pointerId))
      control.current.releasePointerCapture(active.pointerId);
  };
  useEffect(() => {
    if (disabled && gesture.current) {
      const active = gesture.current;
      gesture.current = null;
      callbacks.current.onPreview(null);
      if (control.current?.hasPointerCapture(active.pointerId))
        control.current.releasePointerCapture(active.pointerId);
    }
  }, [disabled]);
  useEffect(() => {
    const element = control.current;
    if (!element || disabled) return;
    // The workspace uses a native wheel listener; stop it here before React delegation.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [disabled]);
  useEffect(() => () => {
    if (gesture.current) {
      gesture.current = null;
      callbacks.current.onPreview(null);
    }
  }, []);
  return (
    <g
      ref={control}
      className="potentiometer-control"
      data-component-control="potentiometer"
      data-testid="pot-knob"
      transform={`translate(${center.x} ${center.y})`}
      pointerEvents={disabled ? 'none' : 'all'}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${t('potentiometerPosition')} · ${component.id}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuetext={percent}
      onPointerDown={(event) => {
        if (disabled) return;
        event.stopPropagation();
        if (event.button !== 0 || gesture.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = pointAt(event.clientX, event.clientY);
        const angle = point ? potentiometerPointerAngle(point) : null;
        gesture.current = { pointerId: event.pointerId, ratio, angle, point, vertical: angle === null };
        callbacks.current.onPreview(ratio);
      }}
      onPointerMove={(event) => {
        if (disabled) return;
        event.stopPropagation();
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const point = pointAt(event.clientX, event.clientY);
        if (!point) return;
        if (active.vertical) {
          const next = active.point ? advancePotentiometerVerticalRatio(active.ratio, point.y - active.point.y) : active.ratio;
          active.point = point;
          if (next !== active.ratio) {
            active.ratio = next;
            callbacks.current.onPreview(next);
          }
          return;
        }
        const angle = potentiometerPointerAngle(point);
        if (angle === null) {
          active.angle = null;
          return;
        }
        const next = active.angle === null ? active.ratio : advancePotentiometerRatio(active.ratio, active.angle, angle);
        active.angle = angle;
        if (next !== active.ratio) {
          active.ratio = next;
          callbacks.current.onPreview(next);
        }
      }}
      onPointerUp={(event) => {
        if (disabled) return;
        event.stopPropagation();
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        gesture.current = null;
        callbacks.current.onCommit(active.ratio);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={(event) => {
        if (!disabled) event.stopPropagation();
        if (gesture.current?.pointerId === event.pointerId) cancel();
      }}
      onLostPointerCapture={(event) => {
        if (!disabled) event.stopPropagation();
        if (gesture.current?.pointerId === event.pointerId) cancel();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
          return;
        }
        const step = event.shiftKey ? 0.1 : 0.01;
        const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
        if (direction || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          cancel();
          callbacks.current.onCommit(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : clampPotentiometerRatio(ratio + direction * step));
        }
      }}
      onKeyUp={(event) => {
        if (!disabled) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        if (!disabled) event.stopPropagation();
      }}
    >
      <title>{t('potentiometerControlHint')}</title>
      <circle className="potentiometer-hit" r="14" fill="transparent" />
      <text data-testid="pot-position" y="24" textAnchor="middle" pointerEvents="none">{percent}</text>
    </g>
  );
}
