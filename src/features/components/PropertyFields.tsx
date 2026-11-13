import { useEffect, useRef, useState } from 'react';
import type { ElectronicComponent } from '../../model/types';
import type { ComponentPropertyUpdate } from '../../model/editor';
import type { TranslationKey } from '../../locales/es/messages';
import { useLocale } from '../../locales/useLocale';
import { ledColors } from '../../model/components';
import { ledOptions } from './catalog';
import { DHT11_LIMITS } from '../../model/dht11';
import { lcdGeometry } from '../../model/lcd';

export function NumberProperty({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: TranslationKey;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const { t } = useLocale();
  const [text, setText] = useState(String(value));
  const canceled = useRef(false);
  useEffect(() => setText(String(value)), [value]);
  const valid =
    text.trim() !== '' &&
    Number.isFinite(Number(text)) &&
    Number(text) >= min &&
    Number(text) <= max;
  const commit = () => {
    if (canceled.current) {
      canceled.current = false;
      setText(String(value));
      return;
    }
    if (valid && Number(text) !== value) onCommit(Number(text));
    else setText(String(value));
  };
  return (
    <label className="property-field">
      <span>{t(label)}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step="any"
        value={text}
        aria-invalid={!valid}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            canceled.current = true;
            event.stopPropagation();
            setText(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export function PropertyFields({
  component,
  onUpdate,
}: {
  component: ElectronicComponent;
  onUpdate: (update: ComponentPropertyUpdate) => void;
}) {
  const { t } = useLocale();
  switch (component.kind) {
    case 'dc-motor': return <>
      <NumberProperty label="motorResistance" value={component.properties.resistance} min={.01} max={1e6}
        onCommit={(resistance) => onUpdate({ kind: 'dc-motor', properties: { ...component.properties, resistance } })} />
      <NumberProperty label="motorNominalVoltage" value={component.properties.nominalVoltage} min={.01} max={60}
        onCommit={(nominalVoltage) => onUpdate({ kind: 'dc-motor', properties: { ...component.properties, nominalVoltage } })} />
      <NumberProperty label="currentLimit" value={component.properties.maxCurrent} min={.001} max={100}
        onCommit={(maxCurrent) => onUpdate({ kind: 'dc-motor', properties: { ...component.properties, maxCurrent } })} />
      <p className="inspector-hint">{t('motorModelNote')}</p>
    </>;
    case 'l293d': return <p className="inspector-hint">{t('driverModelNote')}</p>;
    case 'battery-9v': return <>
      <NumberProperty label="supplyVoltage" value={component.properties.voltage} min={0} max={60}
        onCommit={(voltage) => onUpdate({ kind: 'battery-9v', properties: { ...component.properties, voltage } })} />
      <NumberProperty label="internalResistance" value={component.properties.internalResistance ?? 0} min={0} max={1e6}
        onCommit={(internalResistance) => onUpdate({ kind: 'battery-9v', properties: { ...component.properties, internalResistance } })} />
      <NumberProperty label="currentLimit" value={component.properties.maxCurrent} min={.001} max={100}
        onCommit={(maxCurrent) => onUpdate({ kind: 'battery-9v', properties: { ...component.properties, maxCurrent } })} />
      <p className="inspector-hint">{t('batteryModelNote')}</p>
    </>;
    case 'lcd-16x2': case 'lcd-20x4': return <>
      <p>{t('lcdType')}: HD44780</p>
      <p>{t('lcdCharacters')}: {lcdGeometry(component.kind).columns} × {lcdGeometry(component.kind).rows}</p>
      <p className="inspector-hint">{t('lcdWiringNote')}</p>
    </>;
    case 'pcf8574': return <>
      <label className="property-field"><span>{t('pcfAddress')}</span>
        <select value={component.properties.address} onChange={(event) => onUpdate({ kind: 'pcf8574', properties: { ...component.properties, address: Number(event.target.value) } })}>
          {[...Array.from({ length: 8 }, (_, index) => 0x20 + index), ...Array.from({ length: 8 }, (_, index) => 0x38 + index)].map((address) =>
            <option key={address} value={address}>0x{address.toString(16).toUpperCase()}</option>)}
        </select>
      </label>
      <NumberProperty label="pcfContrast" value={component.properties.contrast} min={0} max={1}
        onCommit={(contrast) => onUpdate({ kind: 'pcf8574', properties: { ...component.properties, contrast } })} />
    </>;
    case 'dht11': return <>
      <NumberProperty label="dhtTemperature" value={component.properties.temperature} min={DHT11_LIMITS.temperatureMin} max={DHT11_LIMITS.temperatureMax}
        onCommit={(temperature) => onUpdate({ kind: 'dht11', properties: { ...component.properties, temperature } })} />
      <NumberProperty label="dhtHumidity" value={component.properties.humidity} min={DHT11_LIMITS.humidityMin} max={DHT11_LIMITS.humidityMax}
        onCommit={(humidity) => onUpdate({ kind: 'dht11', properties: { ...component.properties, humidity } })} />
      <p className="inspector-hint">{t('dhtModelNote')}</p>
    </>;
    case 'resistor':
      return (
        <NumberProperty
          label="resistance"
          value={component.properties.resistance}
          min={0.01}
          max={1e9}
          onCommit={(resistance) => onUpdate({ kind: component.kind, properties: { resistance } })}
        />
      );
    case 'pushbutton':
      return (
        <label className="property-field">
          <span>{t('normallyClosed')}</span>
          <input
            type="checkbox"
            checked={component.properties.normallyClosed}
            onChange={(event) => onUpdate({ kind: 'pushbutton', properties: { normallyClosed: event.target.checked } })}
          />
        </label>
      );
    case 'led':
      return (
        <div className="led-properties">
          <span>{t('ledColor')}</span>
          <div className="color-swatches">
            {ledOptions.map((option) => (
              <button
                key={option.value}
                aria-label={t(option.label)}
                title={t(option.label)}
                aria-pressed={component.properties.color === option.value}
                className={component.properties.color === option.value ? 'selected' : ''}
                style={{ background: ledColors[option.value] }}
                onClick={() => onUpdate({ kind: 'led', properties: { color: option.value } })}
              />
            ))}
          </div>
          <p>{t('ledPinInfo')}</p>
        </div>
      );
    case 'potentiometer':
      return (
        <>
          <NumberProperty
            label="resistance"
            value={component.properties.resistance}
            min={1}
            max={1e9}
            onCommit={(resistance) =>
              onUpdate({
                kind: component.kind,
                properties: { ...component.properties, resistance },
              })
            }
          />
          <NumberProperty
            label="potRatio"
            value={component.properties.ratio}
            min={0}
            max={1}
            onCommit={(ratio) =>
              onUpdate({ kind: component.kind, properties: { ...component.properties, ratio } })
            }
          />
        </>
      );
    case 'power-supply':
      return (
        <NumberProperty
          label="supplyVoltage"
          value={component.properties.voltage}
          min={0}
          max={60}
          onCommit={(voltage) => onUpdate({ kind: component.kind, properties: { voltage } })}
        />
      );
    default:
      return null;
  }
}
