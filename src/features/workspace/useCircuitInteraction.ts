import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, PointerEvent, RefObject } from 'react';
import type {
  ElectronicComponent,
  PinReference,
  Point,
  Viewport,
  Wire,
  WorkspaceTool,
} from '../../model/types';
import { componentDefinitions, createComponent, isComponentKind, isLedColor, newId, pinWorldPosition } from '../../model/components';
import { planComponentMove, planInsertion } from '../../model/breadboard';
import type { InsertionPlan } from '../../model/breadboard';
import type { LedColor } from '../../model/components';
import type { EditorCommand } from '../../model/editor';
import { screenToWorld } from '../../model/coordinates';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';

type Drag =
  | {
      type: 'components';
      start: Point;
      initial: Record<string, Point>;
      positions: Record<string, Point>;
      moved: boolean;
    }
  | { type: 'waypoint'; wire: Wire; index: number; points: Point[]; moved: boolean };
interface Tap {
  screen: Point;
  pin: PinReference | null;
  background: boolean;
  moved: boolean;
}
export interface WireDraft {
  from: PinReference;
  waypoints: Point[];
  cursor: Point;
}
interface InteractionProps {
  controlActive: boolean;
  libraryDrag: { kind: ElectronicComponent['kind']; color?: LedColor } | null;
  locked: boolean;
  components: ElectronicComponent[];
  wires: Wire[];
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  selectedIds: string[];
  tool: WorkspaceTool;
  multiSelect: boolean;
  cancelEpoch: number;
  autoFit: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  execute: (command: EditorCommand) => boolean;
  onSelectComponent: (id: string, additive?: boolean) => void;
  onSelectWire: (id: string) => void;
  onClearSelection: () => void;
  onAdd: (kind: ElectronicComponent['kind'], center: Point, color?: LedColor) => void;
  wireColor: string;
  connectionRequest: PinReference | null;
}
export function useCircuitInteraction(props: InteractionProps) {
  const {
    components,
    wires,
    viewport,
    onViewportChange,
    selectedIds,
    tool,
    multiSelect,
    cancelEpoch,
    stageRef,
    execute,
    onSelectComponent,
    onSelectWire,
    onClearSelection,
    onAdd,
    wireColor,
  } = props;
  const navigation = useWorkspaceNavigation(
    viewport,
    onViewportChange,
    components,
    tool,
    props.autoFit,
    stageRef,
    props.controlActive,
  );
  const [positions, setPositions] = useState<Record<string, Point> | null>(null);
  const [route, setRoute] = useState<{ id: string; points: Point[] } | null>(null);
  const [draft, setDraft] = useState<WireDraft | null>(null);
  const [dropPreview, setDropPreview] = useState<InsertionPlan | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const drag = useRef<Drag | null>(null);
  const tap = useRef<Tap | null>(null);
  const world = (clientX: number, clientY: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    return screenToWorld(
      { x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) },
      viewport,
    );
  };
  const clearDrag = () => {
    drag.current = null;
    tap.current = null;
    setPositions(null);
    setRoute(null);
  };
  useEffect(() => {
    clearDrag();
    navigation.cancelGesture();
    draftRef.current = null;
    setDraft(null);
  }, [cancelEpoch, tool, props.locked, navigation.cancelGesture]);
  useEffect(() => {
    if (props.controlActive) {
      clearDrag();
      navigation.cancelGesture();
    }
  }, [props.controlActive, navigation.cancelGesture]);
  useEffect(() => {
    if (!props.libraryDrag) setDropPreview(null);
  }, [props.libraryDrag]);
  const inputs = useRef({ components, execute, wireColor, locked: props.locked });
  inputs.current = { components, execute, wireColor, locked: props.locked };
  const onPickPin = useCallback((reference: PinReference) => {
    const { components, execute, wireColor, locked } = inputs.current;
    if (locked) return;
    const origin = pinWorldPosition(components, reference);
    if (!origin) return;
    const active = draftRef.current;
    if (!active) {
      const next = { from: reference, waypoints: [], cursor: origin };
      draftRef.current = next;
      setDraft(next);
    } else if (
      execute({
        type: 'add-wire',
        wire: {
          id: newId(),
          from: active.from,
          to: reference,
          color: wireColor,
          waypoints: active.waypoints,
        },
      })
    ) {
      draftRef.current = null;
      setDraft(null);
    }
  }, []);
  const processedRequest = useRef<PinReference | null>(null);
  useEffect(() => {
    if (props.connectionRequest && props.connectionRequest !== processedRequest.current) {
      processedRequest.current = props.connectionRequest;
      onPickPin(props.connectionRequest);
    }
  }, [props.connectionRequest, onPickPin]);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    navigation.pointerHandlers.onPointerDown(event);
    if (props.controlActive) return;
    if (navigation.pointerCount() > 1) {
      clearDrag();
      return;
    }
    if (event.button !== 0 || tool === 'pan') return;
    const target = event.target instanceof Element ? event.target : null;
    const pin = target?.closest<SVGElement>('[data-pin]');
    const component = target?.closest<SVGElement>('[data-reference]')?.dataset.reference;
    const wireId = target?.closest<SVGElement>('[data-wire]')?.dataset.wire;
    const waypoint = target?.closest<SVGElement>('[data-waypoint]')?.dataset.waypoint;
    if (props.locked) {
      if (component) onSelectComponent(component);
      else if (wireId) onSelectWire(wireId);
      return;
    }
    const point = world(event.clientX, event.clientY);
    tap.current = {
      screen: { x: event.clientX, y: event.clientY },
      pin:
        pin?.dataset.pin && pin.dataset.owner
          ? { pinId: pin.dataset.pin, componentId: pin.dataset.owner }
          : null,
      background: !component && !wireId,
      moved: false,
    };
    if (tool === 'connect') {
      if (component && !pin) onSelectComponent(component);
      return;
    }
    if (wireId) {
      onSelectWire(wireId);
      const wire = wires.find((item) => item.id === wireId);
      if (wire && waypoint !== undefined)
        drag.current = {
          type: 'waypoint',
          wire,
          index: Number(waypoint),
          points: wire.waypoints,
          moved: false,
        };
      return;
    }
    if (component) {
      const additive = event.shiftKey || event.ctrlKey || event.metaKey || multiSelect;
      onSelectComponent(component, additive);
      if (additive) return;
      const ids = selectedIds.includes(component) ? selectedIds : [component];
      const initial = Object.fromEntries(
        components.filter((item) => ids.includes(item.id)).map((item) => [item.id, item.position]),
      );
      drag.current = {
        type: 'components',
        start: point,
        initial,
        positions: initial,
        moved: false,
      };
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    navigation.pointerHandlers.onPointerMove(event);
    if (navigation.pointerCount() > 1) {
      clearDrag();
      return;
    }
    const point = world(event.clientX, event.clientY);
    const activeTap = tap.current;
    if (
      activeTap &&
      Math.hypot(event.clientX - activeTap.screen.x, event.clientY - activeTap.screen.y) > 4
    )
      activeTap.moved = true;
    const current = drag.current;
    if (current && activeTap?.moved) {
      current.moved = true;
      if (current.type === 'components') {
        const dx = point.x - current.start.x;
        const dy = point.y - current.start.y;
        current.positions = Object.fromEntries(
          Object.entries(current.initial).map(([id, position]) => [
            id,
            { x: position.x + dx, y: position.y + dy },
          ]),
        );
        setPositions(current.positions);
      } else {
        current.points = current.wire.waypoints.map((p, i) => (i === current.index ? point : p));
        setRoute({ id: current.wire.id, points: current.points });
      }
    }
    if (draftRef.current) {
      const next = { ...draftRef.current, cursor: point };
      draftRef.current = next;
      setDraft(next);
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    const click = tap.current;
    if (navigation.pointerCount() === 1) {
      if (current?.moved) {
        if (current.type === 'components') execute({ type: 'place', positions: current.positions });
        else
          execute({
            type: 'wire',
            id: current.wire.id,
            color: current.wire.color,
            waypoints: current.points,
          });
      } else if (click && !click.moved) {
        if (tool === 'connect') {
          if (click.pin) onPickPin(click.pin);
          else if (click.background && draftRef.current) {
            const point = world(event.clientX, event.clientY);
            const next = {
              ...draftRef.current,
              waypoints: [...draftRef.current.waypoints, point],
              cursor: point,
            };
            draftRef.current = next;
            setDraft(next);
          }
        } else if (click.background) onClearSelection();
      }
    }
    clearDrag();
    navigation.pointerHandlers.onPointerUp(event);
  };
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    clearDrag();
    navigation.pointerHandlers.onPointerCancel(event);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (
      tool === 'select' &&
      !props.locked &&
      selectedIds.length &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      execute({
        type: 'move',
        positions: Object.fromEntries(
          components
            .filter((item) => selectedIds.includes(item.id))
            .map((item) => [
              item.id,
              {
                x:
                  item.position.x +
                  (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                y:
                  item.position.y +
                  (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
              },
            ]),
        ),
      });
    } else navigation.pointerHandlers.onKeyDown(event);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    setDropPreview(null);
    if (props.locked || props.controlActive) return;
    const source = event.dataTransfer.getData('application/x-mesa-component');
    if (!source) return;
    event.preventDefault();
    try {
      const data: unknown = JSON.parse(source);
      if (typeof data !== 'object' || data === null || !('kind' in data)) return;
      if (!isComponentKind(data.kind)) return;
      const color = 'color' in data && isLedColor(data.color) ? data.color : undefined;
      onAdd(data.kind, world(event.clientX, event.clientY), color);
    } catch {
      /* Ignore unrelated drag payloads. */
    }
  };
  const movePlan = useMemo(() => positions ? planComponentMove(components, positions) : null,
    [components, positions]);
  const renderedComponents = movePlan?.components ?? components;
  const renderedWires = useMemo(
    () =>
      route
        ? wires.map((item) => (item.id === route.id ? { ...item, waypoints: route.points } : item))
        : wires,
    [wires, route],
  );
  return {
    ...navigation,
    renderedComponents,
    renderedWires,
    draft,
    insertionHoles: movePlan?.holes ?? dropPreview?.holes ?? [],
    insertionInvalid: (movePlan !== null && !movePlan.valid) || (dropPreview !== null && !dropPreview.valid),
    insertingIds: movePlan?.affectedIds ?? [],
    onPickPin,
    world,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onLostPointerCapture: onPointerCancel,
      onKeyDown,
      onDrop,
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropPreview(null);
      },
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!props.locked && !props.controlActive && event.dataTransfer.types.includes('application/x-mesa-component')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          const source = props.libraryDrag;
          if (source) {
            const center = world(event.clientX, event.clientY);
            const definition = componentDefinitions[source.kind];
            const preview = createComponent(source.kind, { x: center.x - definition.width / 2,
              y: center.y - definition.height / 2 }, '@library-preview', source.color);
            setDropPreview(planInsertion(components, preview));
          }
        }
      },
    },
  };
}
