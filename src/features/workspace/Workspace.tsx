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
import { orthogonalRoute, wirePoints } from '../../model/editor';
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
  multiSelect: boolean;
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
    return (
      <g
        key={item.id}
        data-reference={item.id}
        data-kind={item.kind}
        data-condition={result?.condition ?? 'normal'}
        data-brightness={result?.brightness ?? 0}
        role="button"
        tabIndex={0}
        aria-label={`${t(entry.name)} · ${item.id}`}
        aria-pressed={selectedIds.includes(item.id)}
        className="reference-component"
        transform={`translate(${item.position.x} ${item.position.y}) rotate(${item.rotation})`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            props.onSelectComponent(item.id, event.shiftKey || props.multiSelect);
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
            {...(result ? { result } : {})}
            pressed={ownInput(props.simulation.inputs.buttons, item.id) ?? false}
            {...(wiperRatio !== undefined ? { wiperRatio } : {})}
          />
        </g>
        <text
          className="reference-name"
          x={entry.width / 2}
          y={bounds.y + bounds.height + 25}
          textAnchor="middle"
        >
          {t(entry.name)}
        </text>
        <text
          className="reference-detail"
          x={entry.width / 2}
          y={bounds.y + bounds.height + 43}
          textAnchor="middle"
        >
          {t(props.simulation.snapshot
            ? conditionMessages[result?.condition ?? 'normal']
            : 'unpowered')}
        </text>
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
            <g data-layer="wires">
            {wires.map((wire) => {
              const points = wirePoints(components, wire);
              if (!points) return null;
              return (
                <g
                  key={wire.id}
                  data-wire={wire.id}
                  className={`circuit-wire ${selectedWire === wire.id ? 'selected-wire' : ''} ${props.highlightedIds?.some((id) => id === wire.from.componentId || id === wire.to.componentId) ? 'diagnostic-wire' : ''}`} 
                  tabIndex={0}
                  role="button"
                  aria-label={`${t('wire')} ${wire.id} · ${wire.from.pinId} → ${wire.to.pinId}`}
                  aria-pressed={selectedWire === wire.id}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onSelectWire(wire.id);
                    }
                  }}
                  onDoubleClick={(event) => {
                    if (tool === 'select' && !props.locked) {
                      event.stopPropagation();
                      execute({
                        type: 'wire',
                        id: wire.id,
                        color: wire.color,
                        waypoints: [
                          ...wire.waypoints,
                          interaction.world(event.clientX, event.clientY),
                        ],
                      });
                    }
                  }}
                >
                  <polyline
                    points={pointsAttribute(points)}
                    fill="none"
                    stroke="#00000018"
                    strokeWidth="6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                    transform="translate(0 1)"
                  />
                  <polyline
                    className="wire-stroke"
                    points={pointsAttribute(points)}
                    fill="none"
                    stroke={wire.color}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <polyline
                    points={pointsAttribute(points)}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(12 / viewport.zoom, 5)}
                    strokeLinejoin="round"
                    className="wire-hit"
                  />
                </g>
              );
            })}
            </g>
            <g data-layer="components">{components.filter((item) => item.kind !== 'breadboard').map(renderComponent)}</g>
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
            {tool === 'select' && !props.locked &&
              wires
                .filter((wire) => wire.id === selectedWire)
                .map((wire) => (
                  <g key={`handles-${wire.id}`} data-wire={wire.id}>
                    {wire.waypoints.map((point, index) => (
                      <circle
                        key={index}
                        data-waypoint={index}
                        cx={point.x}
                        cy={point.y}
                        r={7 / viewport.zoom}
                        className="waypoint-handle"
                      >
                        <title>{`${t('waypoint')} ${index + 1}`}</title>
                      </circle>
                    ))}
                  </g>
                ))}
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
      <div className="desk-heading">
        <div className="eyebrow">
          <span className="tiny-square" />
          {t('reference')}
        </div>
        <h1>{t('deskTitle')}</h1>
        <p>{t('deskSubtitle')}</p>
      </div>
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
