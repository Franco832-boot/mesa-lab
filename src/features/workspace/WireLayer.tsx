import type { KeyboardEvent } from 'react';
import type { Point, Wire } from '../../model/types';
import type { EditorCommand } from '../../model/editor';
import { insertWireCorner, moveWireCorner, moveWireSegment, nearestWireSegment, removeWireCorner, routeWaypoints } from '../../model/wireGeometry';
import { useLocale } from '../../locales/useLocale';

interface WireProps {
  wire: Wire;
  points: readonly Point[];
  selected: boolean;
  editable: boolean;
  zoom: number;
  related: boolean;
  select: (id: string) => void;
  world: (x: number, y: number) => Point;
  execute: (command: EditorCommand) => boolean;
}
const pointsAttribute = (points: readonly Point[]) => points.map((point) => `${point.x},${point.y}`).join(' ');
const commit = (props: Pick<WireProps, 'wire' | 'execute'>, points: readonly Point[]) =>
  props.execute({ type: 'wire', id: props.wire.id, color: props.wire.color, waypoints: routeWaypoints(points) });
const arrowDelta = (event: KeyboardEvent<SVGElement>): Point | null => {
  const step = event.shiftKey ? 10 : 1;
  switch (event.key) {
    case 'ArrowLeft': return { x: -step, y: 0 };
    case 'ArrowRight': return { x: step, y: 0 };
    case 'ArrowUp': return { x: 0, y: -step };
    case 'ArrowDown': return { x: 0, y: step };
    default: return null;
  }
};

export function WireLayer(props: WireProps) {
  const { t } = useLocale();
  const { wire, points, selected, editable, zoom } = props;
  return <g data-wire={wire.id}
    className={`circuit-wire ${selected ? 'selected-wire' : ''} ${props.related ? 'diagnostic-wire' : ''}`}
    tabIndex={0} role="button" aria-label={`${t('wire')} ${wire.id} · ${wire.from.pinId} → ${wire.to.pinId}`} aria-pressed={selected}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopPropagation(); props.select(wire.id);
      }
    }}
    onDoubleClick={(event) => {
      if (!editable) return;
      event.stopPropagation();
      const position = props.world(event.clientX, event.clientY), segment = nearestWireSegment(points, position);
      if (segment !== null) commit(props, insertWireCorner(points, segment, position));
    }}>
    <title>{`${t('wire')} ${wire.id} · ${t('wireEditHint')}`}</title>
    <polyline points={pointsAttribute(points)} fill="none" stroke="#00000018" strokeWidth="6"
      strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" transform="translate(0 1)" />
    <polyline className="wire-stroke" points={pointsAttribute(points)} fill="none" stroke={wire.color}
      strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
    {selected && editable ? points.slice(0, -1).map((a, index) => {
      const b = points[index + 1];
      return b ? <line key={index} data-segment={index} className="wire-hit" x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="transparent" strokeWidth={14 / zoom} style={{ cursor: a.x === b.x ? 'ew-resize' : 'ns-resize' }} /> : null;
    }) : <polyline className="wire-hit" points={pointsAttribute(points)} fill="none" stroke="transparent" strokeWidth={14 / zoom} />}
  </g>;
}

/** Overlay controls use the same projected route as the strokes; selection never writes it. */
export function WireControls(props: Pick<WireProps, 'wire' | 'points' | 'zoom' | 'execute'>) {
  const { t } = useLocale();
  const { wire, points, zoom } = props;
  return <g data-wire={wire.id} data-testid="wire-controls">
    {points.slice(0, -1).map((a, index) => {
      const b = points[index + 1];
      if (!b || Math.hypot(b.x - a.x, b.y - a.y) * zoom < 22) return null;
      const vertical = a.x === b.x, midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return <rect key={`segment-${index}`} data-segment={index} className="segment-handle"
        x={midpoint.x - 3 / zoom} y={midpoint.y - 3 / zoom} width={6 / zoom} height={6 / zoom} rx={1 / zoom}
        vectorEffect="non-scaling-stroke" style={{ cursor: vertical ? 'ew-resize' : 'ns-resize' }} tabIndex={0} role="button"
        aria-label={`${t('wireSegment')} ${index + 1} · ${t('wireSegmentHint')}`}
        onKeyDown={(event) => {
          const delta = arrowDelta(event);
          if (delta) {
            event.preventDefault(); event.stopPropagation();
            if (vertical ? delta.x !== 0 : delta.y !== 0) commit(props, moveWireSegment(points, index, delta));
          } else if (event.key === 'Enter') {
            event.preventDefault(); event.stopPropagation(); commit(props, insertWireCorner(points, index, midpoint));
          } else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); }
        }}>
        <title>{`${t('wireSegment')} ${index + 1} · ${t('wireSegmentHint')}`}</title>
      </rect>;
    })}
    {points.slice(1, -1).map((point, offset) => {
      const index = offset + 1;
      return <circle key={`corner-${index}`} data-waypoint={index} data-control-x={point.x} data-control-y={point.y}
        cx={point.x} cy={point.y} r={5.5 / zoom} className="waypoint-handle" vectorEffect="non-scaling-stroke"
        tabIndex={0} role="button" aria-label={`${t('waypoint')} ${index} · ${t('wireCornerHint')}`}
        onDoubleClick={(event) => { event.stopPropagation(); commit(props, removeWireCorner(points, index)); }}
        onKeyDown={(event) => {
          const delta = arrowDelta(event);
          if (delta) {
            event.preventDefault(); event.stopPropagation();
            const next = { x: point.x + delta.x, y: point.y + delta.y }, group = event.currentTarget.parentElement;
            if (commit(props, moveWireCorner(points, index, next))) requestAnimationFrame(() => {
              for (const control of group?.querySelectorAll<SVGElement>('[data-waypoint]') ?? [])
                if (Number(control.dataset.controlX) === next.x && Number(control.dataset.controlY) === next.y) control.focus();
            });
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault(); event.stopPropagation(); commit(props, removeWireCorner(points, index));
          }
        }}>
        <title>{`${t('waypoint')} ${index} · ${t('wireCornerHint')}`}</title>
      </circle>;
    })}
  </g>;
}
