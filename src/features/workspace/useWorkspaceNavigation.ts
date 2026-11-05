import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { ElectronicComponent, Point, Viewport, WorkspaceTool } from '../../model/types';
import { localToWorld, MAX_ZOOM, MIN_ZOOM, screenToWorld, zoomAt } from '../../model/coordinates';
import { visualBounds } from '../../model/physical';

interface Gesture {
  viewport: Viewport;
  points: Point[];
  pan: boolean;
}
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function useWorkspaceNavigation(
  viewport: Viewport,
  onChange: (viewport: Viewport) => void,
  components: ElectronicComponent[],
  tool: WorkspaceTool,
  autoFit: boolean,
  stageRef: RefObject<HTMLDivElement | null>,
  controlActive = false,
) {
  const blocked = useRef(controlActive);
  blocked.current = controlActive;
  const current = useRef(viewport);
  const callback = useRef(onChange);
  current.current = viewport;
  callback.current = onChange;
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const cancelGesture = useCallback(() => {
    const ids = [...pointers.current.keys()];
    pointers.current.clear();
    gesture.current = null;
    for (const id of ids)
      if (stageRef.current?.hasPointerCapture(id)) stageRef.current.releasePointerCapture(id);
  }, [stageRef]);
  const apply = useCallback((next: Viewport) => {
    current.current = next;
    callback.current(next);
  }, []);
  const localPoint = (clientX: number, clientY: number): Point => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return { x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) };
  };
  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const corners = components.flatMap((item) => {
      const { x, y, width, height } = visualBounds(item.kind);
      return [
        { x, y },
        { x: x + width, y },
        { x, y: y + height + 50 },
        { x: x + width, y: y + height + 50 },
      ].map((point) => localToWorld(point, item.position, item.rotation));
    });
    const minX = Math.min(0, ...corners.map((p) => p.x)) - 25;
    const minY = Math.min(0, ...corners.map((p) => p.y)) - 10;
    const maxX = Math.max(760, ...corners.map((p) => p.x)) + 25;
    const maxY = Math.max(710, ...corners.map((p) => p.y)) + 35;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(
        1.1,
        (stage.clientWidth - 32) / (maxX - minX),
        (stage.clientHeight - 40) / (maxY - minY),
      ),
    );
    apply({
      zoom,
      offset: {
        x: (stage.clientWidth - (maxX - minX) * zoom) / 2 - minX * zoom,
        y: (stage.clientHeight - (maxY - minY) * zoom) / 2 - minY * zoom,
      },
    });
  }, [apply, components]);
  const initialFit = useRef(autoFit);
  useEffect(() => {
    if (initialFit.current) {
      initialFit.current = false;
      fit();
    }
  }, [fit]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (blocked.current) return;
      const bounds = stage.getBoundingClientRect();
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      apply(
        zoomAt(
          current.current,
          anchor,
          current.current.zoom * Math.exp(-event.deltaY * factor * 0.0018),
        ),
      );
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage.removeEventListener('wheel', wheel);
  }, [apply]);
  const zoom = (factor: number) => {
    const stage = stageRef.current;
    if (stage)
      apply(
        zoomAt(
          current.current,
          { x: stage.clientWidth / 2, y: stage.clientHeight / 2 },
          current.current.zoom * factor,
        ),
      );
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked.current) return;
    if (event.button !== 0 && event.button !== 1) return;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(event.clientX, event.clientY));
    const onReference =
      event.target instanceof Element &&
      Boolean(event.target.closest('[data-reference],[data-wire],[data-waypoint]'));
    gesture.current = {
      viewport: current.current,
      points: [...pointers.current.values()],
      pan: tool === 'pan' || (tool !== 'connect' && !onReference) || event.button === 1,
    };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked.current) return;
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, localPoint(event.clientX, event.clientY));
    const points = [...pointers.current.values()];
    const baseline = gesture.current;
    const [a, b] = points;
    const [startA, startB] = baseline.points;
    if (!a || !startA) return;
    if (b && startB) {
      const center = midpoint(a, b);
      const anchor = screenToWorld(midpoint(startA, startB), baseline.viewport);
      const scale = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          (baseline.viewport.zoom * distance(a, b)) / Math.max(1, distance(startA, startB)),
        ),
      );
      apply({
        zoom: scale,
        offset: { x: center.x - anchor.x * scale, y: center.y - anchor.y * scale },
      });
    } else if (baseline.pan) {
      apply({
        zoom: baseline.viewport.zoom,
        offset: {
          x: baseline.viewport.offset.x + a.x - startA.x,
          y: baseline.viewport.offset.y + a.y - startA.y,
        },
      });
    }
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = pointers.current.size
      ? { viewport: current.current, points: [...pointers.current.values()], pan: true }
      : null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (blocked.current) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(1.2);
    } else if (event.key === '-') {
      event.preventDefault();
      zoom(1 / 1.2);
    } else if (event.key === '0') {
      event.preventDefault();
      fit();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const { offset, zoom: scale } = current.current;
      apply({
        zoom: scale,
        offset: {
          x: offset.x + (event.key === 'ArrowLeft' ? 35 : event.key === 'ArrowRight' ? -35 : 0),
          y: offset.y + (event.key === 'ArrowUp' ? 35 : event.key === 'ArrowDown' ? -35 : 0),
        },
      });
    }
  };
  return {
    stageRef,
    fit,
    zoom,
    pointerCount: () => pointers.current.size,
    cancelGesture,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onLostPointerCapture: onPointerEnd,
      onKeyDown,
    },
  };
}
