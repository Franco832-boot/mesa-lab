import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { ComponentKind, ElectronicComponent, PinReference } from '../../model/types';
import type { ComponentPropertyUpdate } from '../../model/editor';
import { componentDefinitions } from '../../model/components';
import { WORLD_UNITS_PER_MM } from '../../model/physical';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { getCatalogEntry } from './catalog';
import { ComponentThumbnail } from './ComponentArtwork';
import { PropertyFields } from './PropertyFields';
import { SimulationProperties } from './SimulationProperties';
import type { SimulationController } from '../simulation/useSimulation';
import { ownInput, pinKey } from '../../sim/topology';

interface InspectorProps {
  headerActions?: ReactNode;
  simulation: SimulationController;
  locked: boolean;
  kind: ComponentKind;
  component?: ElectronicComponent;
  selectedCount: number;
  onClose: () => void;
  onRoadmap: () => void;
  onUpdate: (update: ComponentPropertyUpdate) => void;
  onRotate: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onStartConnection: (reference: PinReference) => void;
}
export function Inspector({
  headerActions,
  simulation,
  locked,
  kind,
  component,
  selectedCount,
  onClose,
  onRoadmap,
  onUpdate,
  onRotate,
  onDuplicate,
  onRemove,
  onStartConnection,
}: InspectorProps) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<'overview' | 'pinout'>('overview');
  const [advanced, setAdvanced] = useState(locked);
  useEffect(() => { if (locked) setAdvanced(true); }, [locked]);
  const compact = kind === 'led' || kind === 'arduino-uno' || kind === 'esp8266';
  const entry = getCatalogEntry(kind);
  const pins = componentDefinitions[kind].pins;
  const [pinId, setPinId] = useState(pins[0]?.id ?? '');
  const componentResult = component ? ownInput(simulation.snapshot?.components, component.id) : undefined;
  const pressed = component ? ownInput(simulation.inputs.buttons, component.id) : undefined;
  const wiperRatio = component ? ownInput(simulation.inputs.potentiometers, component.id) : undefined;
  const selectedPin = pins.find((pin) => pin.id === pinId);
  const pinReading = component ? simulation.snapshot?.pins[pinKey(component.id, pinId)] : undefined;
  const isEsp = kind === 'esp8266';
  const isBoard = isEsp || kind === 'arduino-uno';
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const voltage = format.format(isEsp ? 3.3 : 5);
  return (
    <aside className="inspector-panel panel" aria-label={t('properties')}>
      <div className="panel-heading">
        <div>
          <h2>{t('properties')}</h2>
          <p>
            {component ? `${selectedCount} ${t('selectedComponents')}` : t('propertiesSubtitle')}
          </p>
        </div>
        <div className="inspector-heading-actions">
          {headerActions}
        <button data-testid="inspector-close" className="icon-button" aria-label={t('closeInspector')} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        </div>
      </div>
      <div id="context-inspector-body" className="inspector-scroll">
        <div data-inspector-content className="inspector-content">
        <div className="inspector-preview">
          <div className="preview-tag">{t('componentModel')}</div>
          <ComponentThumbnail
            kind={kind}
            {...(component ? { properties: component.properties } : {})}
            {...(componentResult ? { result: componentResult } : {})}
            {...(pressed !== undefined ? { pressed } : {})}
            {...(wiperRatio !== undefined ? { wiperRatio } : {})}
          />
          <span className="preview-floor" />
        </div>
        <div className="inspector-title">
          <h3>{t(entry.name)}</h3>
          <p>{t(entry.description)}</p>
          <p>
            {t('physicalDimensions')}: {format.format(entry.physical.widthMm)} ×{' '}
            {format.format(entry.physical.heightMm)} mm
          </p>
          <p>
            {t('physicalScale')}: {WORLD_UNITS_PER_MM} px/mm
          </p>
        </div>
        {component && (
          <fieldset disabled={locked} className="component-edit-actions simulation-edit-fieldset">
            <button className="secondary-button" title={t('rotate')} onClick={onRotate}>
              <Icon name="rotate" size={14} />
              {component.rotation}°
            </button>
            <button
              className="icon-button"
              title={t('duplicate')}
              aria-label={t('duplicate')}
              onClick={onDuplicate}
            >
              <Icon name="copy" />
            </button>
            <button
              className="icon-button"
              title={t('remove')}
              aria-label={t('remove')}
              onClick={onRemove}
            >
              <Icon name="trash" />
            </button>
          </fieldset>
        )}
        {locked && <p className="inspector-hint">{t('simulationLocked')}</p>}
        <div className="inspector-tabs">
          <button
            className={tab === 'overview' ? 'selected' : ''}
            onClick={() => setTab('overview')}
            aria-pressed={tab === 'overview'}
          >
            {t('overview')}
          </button>
          {isBoard && (
            <button
              className={tab === 'pinout' ? 'selected' : ''}
              onClick={() => setTab('pinout')}
              aria-pressed={tab === 'pinout'}
            >
              {t('pinout')}
            </button>
          )}
        </div>
        {isBoard && tab === 'pinout' ? (
          <div className="pinout-content">
            {isEsp && <p>{t('gpioNote')}</p>}
            <table>
              <thead>
                <tr>
                  <th>{t('boardPin')}</th>
                  <th>{t('gpio')}</th>
                  <th>{t('boot')}</th>
                </tr>
              </thead>
              <tbody>
                {pins.map((pin) => (
                  <tr key={pin.id}>
                    <td title={pin.label}>{pin.id}</td>
                    <td>{pin.gpio ?? '—'}</td>
                    <td>{pin.bootLevel ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="property-list">
              {isBoard && (
                <>
                  <div>
                    <span>{t('processor')}</span>
                    <strong>{isEsp ? 'ESP8266EX' : 'ATmega328P'}</strong>
                  </div>
                  <div>
                    <span>{t('logicVoltage')}</span>
                    <strong className="voltage-value">{voltage} V</strong>
                  </div>
                  <div>
                    <span>{t('clock')}</span>
                    <strong>{isEsp ? '80 MHz' : '16 MHz'}</strong>
                  </div>
                </>
              )}
              <div>
                <span>{t('pins')}</span>
                <strong>{pins.length}</strong>
              </div>
              {kind === 'breadboard' && (
                <div>
                  <span>{t('contactGroups')}</span>
                  <strong>{componentDefinitions.breadboard.contactGroups.length}</strong>
                </div>
              )}
            </div>
            {component && (
              <fieldset disabled={locked} className="editable-properties simulation-edit-fieldset">
                <PropertyFields component={component} onUpdate={onUpdate} />
              </fieldset>
            )}
            {!component && <p className="inspector-hint">{t('selectToEdit')}</p>}
          </>
        )}
        {compact && <button type="button" className="inspector-more text-button" data-testid="inspector-more"
          aria-expanded={advanced} aria-controls="inspector-advanced" onClick={() => setAdvanced((value) => !value)}>
          {t('inspectorMore')} <Icon name={advanced ? 'minus' : 'plus'} size={14} />
        </button>}
        <div id="inspector-advanced" hidden={compact && !advanced}>
        {component && (
          <div className="terminal-picker">
            <label htmlFor="inspector-pin">{t('exactPin')}</label>
            <select
              id="inspector-pin"
              data-testid="terminal-select"
              value={pinId}
              onChange={(event) => setPinId(event.target.value)}
            >
              {pins.map((pin) => (
                <option key={pin.id} value={pin.id}>
                  {pin.id} · {pin.label}
                  {pin.gpio !== undefined ? ` · GPIO${pin.gpio}` : ''}
                </option>
              ))}
            </select>
            {selectedPin?.bootLevel && (
              <p>
                {t('boot')}: {selectedPin.bootLevel}
              </p>
            )}
            <button
              className="secondary-button"
              disabled={locked}
              data-testid="connect-terminal"
              onClick={() => onStartConnection({ componentId: component.id, pinId })}
            >
              <Icon name="wire" size={15} />
              {t('connectThisPin')}
            </button>
            <p>{t('exactPinHint')}</p>
            {simulation.snapshot && (
              <p data-testid="selected-pin-voltage">
                {t('pinVoltage')}: {pinReading?.voltage === undefined ? t('unresolvedValue') : `${format.format(pinReading.voltage)} V`}
                <br />{t(isBoard && selectedPin?.gpio !== undefined ? 'gpioReferenceNote' : 'pinReferenceNote')}
              </p>
            )}
          </div>
        )}
        {component && <SimulationProperties component={component} simulation={simulation} />}
        <div className="info-callout">
          <Icon name="info" size={17} />
          <div>
            <strong>{t(isBoard ? 'noFirmware' : 'electricalScope')}</strong>
            <p>
              {t(
                kind === 'breadboard'
                  ? 'breadboardNote'
                  : isBoard
                    ? 'noFirmwareDetail'
                    : 'componentNote',
              )}
            </p>
          </div>
        </div>
        {isEsp && <p className="voltage-note">{t('voltageNote')}</p>}
      <div className="next-card">
        <span className="eyebrow">
          {t('comingNext')}
          <span className="small-tag">{t('phase5')}</span>
        </span>
        <h3>{t('nextTitle')}</h3>
        <p>{t('nextDescription')}</p>
        <button onClick={onRoadmap}>
          {t('roadmap')}
          <Icon name="arrow" size={15} />
        </button>
      </div>
        </div>
        </div>
      </div>
    </aside>
  );
}
