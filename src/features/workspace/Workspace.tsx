import { memo, useId } from 'react';
import type { ReactNode, RefObject } from 'react';
import type {
  ElectronicComponent,
  PinReference,
  Point,
  Viewport,
  Wire,
  WorkspaceTool,
} from '../../model/types';
import type { EditorCommand } from '../../model/editor';
import { orthogonalRoute } from '../../model/editor';
import { wireGeometry } from '../../model/wireGeometry';
import { WireControls, WireLayer } from './WireLayer';
import { pinWorldPosition } from '../../model/components';
import { CONTACT_PITCH_MM, millimetersToWorld, visualBounds } from '../../model/physical';
import type { LedColor } from '../../model/components';
import { useLocale } from '../../locales/useLocale';
import { ComponentArtwork } from '../components/ComponentArtwork';
import { getCatalogEntry } from '../components/catalog';
import { Icon } from '../../shared/Icon';
import { PinLayer } from './PinLayer';
import { useCircuitInteraction } from './useCircuitInteraction';
import type { SimulationController } from '../simulation/useSimulation';
import { conditionMessages } from '../simulation/messages';
import { ownInput } from '../../sim/topology';
import { PotentiometerControl } from '../components/PotentiometerControl';

const Artwork = memo(ComponentArtwork);
interface WorkspaceProps {
  inspector?: (components: ElectronicComponent[], wires: Wire[]) => ReactNode;
  inspectorDockOffset?: number;
  highlightedIds?: readonly string[];
  wiperPreview: { componentId: string; ratio: number } | null;
  onWiperPreview: (componentId: string, ratio: number | null) => void;
  onWiperCommit: (componentId: string, ratio: number) => void;
  controlActive: boolean;
  libraryDrag: { kind: ElectronicComponent['kind']; color?: LedColor } | null;
  locked: boolean;
  simulation: SimulationController;
  components: ElectronicComponent[];
  wires: Wire[];
  viewport: Viewport;
  onViewportChange: (viewport: Viewport) => void;
  selectedIds: string[];
  selectedWire: string | null;
  onSelectComponent: (id: string, additive?: boolean) => void;
  onSelectWire: (id: string) => void;
  onClearSelection: () => void;
  onAdd: (kind: ElectronicComponent['kind'], center: Point, color?: LedColor) => void;
  execute: (command: EditorCommand) => boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  tool: WorkspaceTool;
  cancelEpoch: number;
  autoFit: boolean;
  grid: boolean;
  onToggleGrid: () => void;
  wireColor: string;
  connectionRequest: PinReference | null;
}
const pointsAttribute = (points: Point[]) =>
  points.map((point) => `${point.x},${point.y}`).join(' ');
export function Workspace(props: WorkspaceProps) {
  const { t } = useLocale();
  const { viewport, selectedIds, selectedWire, tool, grid, onToggleGrid, execute } = props;
  const patternId = useId();
  const interaction = useCircuitInteraction(props);
  const {
    renderedComponents: components,
    renderedWires: wires,
    draft,
    stageRef,
    fit,
    zoom,
    handlers,
  } = interaction;
  const origin = draft ? pinWorldPosition(components, draft.from) : null;
  const renderComponent = (item: ElectronicComponent) => {
    const entry = getCatalogEntry(item.kind);
    const bounds = visualBounds(item.kind);
    const result = ownInput(props.simulation.snapshot?.components, item.id);
    const wiperRatio = props.wiperPreview?.componentId === item.id ? props.wiperPreview.ratio
      : ownInput(props.simulation.inputs.potentiometers, item.id);
    const status = t(props.simulation.snapshot ? conditionMessages[result?.condition ?? 'normal'] : 'unpowered');
    const label = `${t(entry.name)} · ${item.id} · ${status}`;
    return (
      <g
        key={item.id}
        data-reference={item.id}
        data-kind={item.kind}
        data-condition={result?.condition ?? 'normal'}
        data-brightness={result?.brightness ?? 0}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={selectedIds.includes(item.id)}
        className="reference-component"
        transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotation})`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            props.onSelectComponent(item.id, event.shiftKey);
            if (item.kind === 'pushbutton' && props.simulation.status === 'running')
              props.simulation.setButton(item.id, true);
          }
        }}
        onKeyUp={(event) => {
          if (item.kind === 'pushbutton' && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            event.stopPropagation();
            props.simulation.setButton(item.id, false);
          }
        }}
        onBlur={() => {
          if (item.kind === 'pushbutton') props.simulation.setButton(item.id, false);
        }}
        onPointerDown={(event) => {
          if (item.kind === 'pushbutton' && tool !== 'pan' && props.simulation.status === 'running' && event.button === 0) {
            event.stopPropagation();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            props.onSelectComponent(item.id);
            props.simulation.setButton(item.id, true);
          }
        }}
        onPointerUp={(event) => {
          if (item.kind === 'pushbutton' && event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.stopPropagation();
            props.simulation.setButton(item.id, false);
          }
        }}
        onPointerCancel={() => {
          if (item.kind === 'pushbutton') props.simulation.setButton(item.id, false);
        }}
        onLostPointerCapture={() => {
          if (item.kind === 'pushbutton') props.simulation.setButton(item.id, false);
        }}
      >
        <title>{label}</title>
        <rect
          className={`component-outline  ${interaction.insertionInvalid && interaction.insertingIds.includes(item.id) ? 'invalid-insertion' : ''}`}
          x={bounds.x - 6}
          y={bounds.y - 6}
          width={bounds.width + 12}
          height={bounds.height + 12}
          rx="9"
        />
        <g className="artwork-shadow">
          <Artwork
            kind={item.kind}
            properties={item.properties}
            inserted={item.kind === 'led' && Boolean(item.attachments?.length) &&
              !(interaction.insertionInvalid && interaction.insertingIds.includes(item.id))}
            {...(result ? { result } : {})}
            pressed={ownInput(props.simulation.inputs.buttons, item.id) ?? false}
            {...(wiperRatio !== undefined ? { wiperRatio } : {})}
          />
        </g>
      </g>
    );
  };
  return (
    <section className="workbench" aria-label={t('workspace')}>
      <div
        ref={stageRef}
        className={`stage tool-${tool}`}
        data-testid="workspace-stage"
        data-interaction={props.controlActive ? 'component-control' : interaction.insertingIds.length ? 'component-drag' : draft ? 'wire-creation' : tool === 'pan' ? 'canvas-pan' : 'idle'}
        tabIndex={0}
        role="region"
        aria-label={t('canvasLabel')}
        {...handlers}
      >
        <svg className="workspace-svg" width="100%" height="100%" aria-label={t('workspace')}>
          <defs>
            <pattern
              id={patternId}
              width={millimetersToWorld(CONTACT_PITCH_MM) * viewport.zoom}
              height={millimetersToWorld(CONTACT_PITCH_MM) * viewport.zoom}
              patternUnits="userSpaceOnUse"
              x={viewport.offset.x}
              y={viewport.offset.y}
            >
              <circle cx="1" cy="1" r="0.8" fill="#c9ced4" />
            </pattern>
          </defs>
          {grid && <rect width="100%" height="100%" fill={`url(#${patternId})`} />}
          <g
            transform={`translate(${viewport.offset.x} ${viewport.offset.y}) scale(${viewport.zoom})`}
          >
            <g data-layer="background">{components.filter((item) => item.kind === 'breadboard').map(renderComponent)}</g>
            <g data-layer="boards">{components.filter((item) => item.kind === 'arduino-uno' || item.kind === 'esp8266').map(renderComponent)}</g>
            <g data-layer="wires">
              {wires.map((wire) => {
                const points = wireGeometry(components, wire);
                return points ? <WireLayer key={wire.id} wire={wire} points={points} selected={selectedWire === wire.id}
                  editable={tool === 'select' && !props.locked} zoom={viewport.zoom} select={props.onSelectWire}
                  related={props.highlightedIds?.some((id) => id === wire.from.componentId || id === wire.to.componentId) ?? false}
                  world={interaction.world} execute={execute} /> : null;
              })}
            </g>
            <g data-layer="components">{components.filter((item) => !['breadboard', 'arduino-uno', 'esp8266'].includes(item.kind)).map(renderComponent)}</g>
            <g data-layer="overlays">
              {components.map((item) => {
                const bounds = visualBounds(item.kind);
                const result = ownInput(props.simulation.snapshot?.components, item.id);
                const invalid = interaction.insertionInvalid && interaction.insertingIds.includes(item.id);
                const selected = selectedIds.includes(item.id), related = props.highlightedIds?.includes(item.id);
                const warning = ['warning', 'overheated', 'damaged'].includes(result?.condition ?? '');
                return <g key={`overlay-${item.id}`} data-overlay-for={item.id} transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotation})`} pointerEvents="none">
                  {(selected || related || invalid) && <rect data-selection-for={item.id}
                    className={`component-outline ${selected ? 'is-selected' : ''} ${related ? 'is-diagnostic' : ''} ${invalid ? 'invalid-insertion' : ''}`}
                    style={{ pointerEvents: 'none', fill: 'none' }} x={bounds.x - 6} y={bounds.y - 6}
                    width={bounds.width + 12} height={bounds.height + 12} rx="9" />}
                  {warning && <g className="component-warning" transform={`translate(${bounds.x + bounds.width} ${bounds.y})`}>
                    <title>{t(conditionMessages[result?.condition ?? 'warning'])}</title>
                    <circle r="9" fill="#fff4dc" stroke="#b58c3b" />
                    <text textAnchor="middle" y="4" fill="#8b6221" fontSize="12">!</text>
                  </g>}
                </g>;
              })}
            {tool === 'connect' && !props.locked &&
              components.map((item) => (
                <g
                  key={`pins-${item.id}`}
                  transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotation})`}
                >
                  <PinLayer
                    kind={item.kind}
                    componentId={item.id}
                    activePin={draft?.from.componentId === item.id ? draft.from.pinId : null}
                    onPick={interaction.onPickPin}
                  />
                </g>
              ))}
            {wires.map((wire) => {
              const points = wireGeometry(components, wire);
              if (!points) return null;
              const controls = interaction.routePreview?.id === wire.id ? interaction.routePreview.points : points;
              return <g key={`wire-overlay-${wire.id}`}>
                <g data-wire-endpoints={wire.id} pointerEvents="none" aria-hidden="true">
                  {[points[0], points.at(-1)].map((point, index) => point ? <circle key={index} cx={point.x} cy={point.y}
                    r={2.3 / viewport.zoom} fill={wire.color} stroke="white" strokeWidth={0.7 / viewport.zoom} /> : null)}
                </g>
                {tool === 'select' && !props.locked && selectedWire === wire.id &&
                  <WireControls wire={wire} points={controls} zoom={viewport.zoom} execute={execute} />}
              </g>;
            })}
            {interaction.insertionHoles.map((hole) => {
              const point = pinWorldPosition(components, hole);
              return point ? <circle key={`${hole.componentId}-${hole.pinId}`}
                data-testid="insertion-hole" data-board={hole.componentId} data-hole={hole.pinId}
                className="insertion-hole" cx={point.x} cy={point.y} r="4" pointerEvents="none" /> : null;
            })}
            {components.filter((item) => item.kind === 'potentiometer').map((item) => (
              <g key={`control-${item.id}`} transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotation})`}>
                <PotentiometerControl component={item}
                  ratio={props.wiperPreview?.componentId === item.id ? props.wiperPreview.ratio
                    : ownInput(props.simulation.inputs.potentiometers, item.id) ?? item.properties.ratio}
                  disabled={props.simulation.status === 'paused' || tool !== 'select'}
                  onPreview={(ratio) => {
                    if (ratio !== null && !props.controlActive) props.onSelectComponent(item.id);
                    props.onWiperPreview(item.id, ratio);
                  }}
                  onCommit={(ratio) => props.onWiperCommit(item.id, ratio)} />
              </g>
            ))}
            {draft && origin && (
              <g pointerEvents="none">
                <polyline
                  points={pointsAttribute(
                    orthogonalRoute([origin, ...draft.waypoints, draft.cursor]),
                  )}
                  className="wire-preview"
                  fill="none"
                  stroke={props.wireColor}
                  strokeWidth="3"
                  strokeDasharray="7 4"
                  strokeLinejoin="round"
                />
                {draft.waypoints.map((point, index) => (
                  <circle key={index} cx={point.x} cy={point.y} r="4" fill={props.wireColor} />
                ))}
              </g>
            )}
            </g>
          </g>
        </svg>
      </div>
      {props.inspector?.(components, wires)}
      <div className="reference-notice" role="status">
        <Icon name="info" size={14} />
        {t(interaction.insertionInvalid ? 'breadboardInvalidPlacement' : interaction.insertionHoles.length ? 'breadboardPlacementReady' : props.locked ? 'simulationLocked' : tool === 'connect' ? (draft ? 'chooseDestination' : 'chooseOrigin') : 'referenceOnly')}
      </div>
      <div className="canvas-controls" style={{ bottom: props.inspectorDockOffset || undefined }}>
        <button
          className={`icon-button ${grid ? 'active-subtle' : ''}`}
          aria-label={t('grid')}
          title={t('grid')}
          aria-pressed={grid}
          onClick={onToggleGrid}
        >
          <Icon name="grid" />
        </button>
        <span className="control-divider" />
        <button
          className="icon-button"
          aria-label={t('zoomOut')}
          title={t('zoomOut')}
          onClick={() => zoom(1 / 1.2)}
          disabled={props.controlActive}
        >
          <Icon name="minus" />
        </button>
        <output className="zoom-readout">{Math.round(viewport.zoom * 100)}%</output>
        <button
          className="icon-button"
          aria-label={t('zoomIn')}
          title={t('zoomIn')}
          onClick={() => zoom(1.2)}
          disabled={props.controlActive}
        >
          <Icon name="plus" />
        </button>
        <span className="control-divider" />
        <button className="icon-button" aria-label={t('fit')} title={t('fit')} onClick={fit} disabled={props.controlActive}>
          <Icon name="fit" />
        </button>
      </div>
      <div className="gesture-hint">
        <Icon name="hand" size={13} />
        <span>{t('gestureHint')}</span>
        <span className="hint-separator">·</span>
        <span>{t('zoomHint')}</span>
      </div>
    </section>
  );
}
