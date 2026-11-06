import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ElectronicComponent, Wire } from '../../model/types';
import type { EditorCommand } from '../../model/editor';
import { pinWorldPosition } from '../../model/components';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { NumberProperty } from './PropertyFields';

export function WireInspector({
  headerActions,
  locked,
  wire,
  components,
  execute,
  onClose,
  onRemove,
}: {
  headerActions?: ReactNode;
  locked: boolean;
  wire: Wire;
  components: ElectronicComponent[];
  execute: (command: EditorCommand) => boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const { t } = useLocale();
  const [color, setColor] = useState(wire.color);
  useEffect(() => setColor(wire.color), [wire.color]);
  const update = (next: Pick<Wire, 'color' | 'waypoints'>) =>
    execute({ type: 'wire', id: wire.id, ...next });
  const addPoint = () => {
    const from = wire.waypoints.at(-1) ?? pinWorldPosition(components, wire.from);
    const to = pinWorldPosition(components, wire.to);
    if (from && to)
      update({
        color: wire.color,
        waypoints: [...wire.waypoints, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 35 }],
      });
  };
  return (
    <aside className="inspector-panel panel" aria-label={t('properties')}>
      <div className="panel-heading">
        <div>
          <h2>{t('wire')}</h2>
          <p>{t('wireInspectorHint')}</p>
        </div>
        <div className="inspector-heading-actions">
          {headerActions}
        <button data-testid="inspector-close" className="icon-button" onClick={onClose} aria-label={t('closeInspector')}>
          <Icon name="close" />
        </button>
        </div>
      </div>
      <div id="context-inspector-body" className="inspector-scroll wire-inspector">
        <div data-inspector-content className="inspector-content">
        <div className="wire-terminals">
          <code>
            {wire.from.componentId}
            <br />
            {wire.from.pinId}
          </code>
          <Icon name="arrow" />
          <code>
            {wire.to.componentId}
            <br />
            {wire.to.pinId}
          </code>
        </div>
        <fieldset disabled={locked} className="simulation-edit-fieldset">
        <label className="property-field">
          <span>{t('wireColor')}</span>
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            onBlur={() => {
              if (color !== wire.color) update({ color, waypoints: wire.waypoints });
            }}
          />
        </label>
        <button className="secondary-button" onClick={addPoint}>
          <Icon name="plus" size={14} />
          {t('addWaypoint')}
        </button>
        <p className="inspector-hint">{t('waypointHint')}</p>
        {wire.waypoints.map((point, index) => (
          <fieldset className="waypoint-fields" key={index}>
            <legend>
              {t('waypoint')} {index + 1}
            </legend>
            <NumberProperty
              label="coordinateX"
              value={point.x}
              min={-1e7}
              max={1e7}
              onCommit={(x) =>
                update({
                  color: wire.color,
                  waypoints: wire.waypoints.map((item, i) => (i === index ? { ...item, x } : item)),
                })
              }
            />
            <NumberProperty
              label="coordinateY"
              value={point.y}
              min={-1e7}
              max={1e7}
              onCommit={(y) =>
                update({
                  color: wire.color,
                  waypoints: wire.waypoints.map((item, i) => (i === index ? { ...item, y } : item)),
                })
              }
            />
            <button
              className="text-button"
              onClick={() =>
                update({
                  color: wire.color,
                  waypoints: wire.waypoints.filter((_, i) => i !== index),
                })
              }
            >
              {t('removeWaypoint')}
            </button>
          </fieldset>
        ))}
        <button className="secondary-button" onClick={onRemove}>
          <Icon name="trash" size={14} />
          {t('remove')}
        </button>
        </fieldset>
        </div>
      </div>
      <div className="info-callout">
        <Icon name="info" />
        <p>{t(locked ? 'simulationLocked' : 'electricalScopeDetail')}</p>
      </div>
    </aside>
  );
}
