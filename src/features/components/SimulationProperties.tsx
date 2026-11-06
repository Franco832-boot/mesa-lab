import type { ElectronicComponent, GpioState } from '../../model/types';
import { componentDefinitions } from '../../model/components';
import { potentiometerResistances } from '../../model/potentiometer';
import type { SimulationController } from '../simulation/useSimulation';
import { conditionMessages, logicMessages } from '../simulation/messages';
import { useLocale } from '../../locales/useLocale';
import { gpioConfiguration, gpioPins, GPIO_CURRENT_LIMIT_A } from '../../sim/gpio';
import { ownInput, pinKey } from '../../sim/topology';
import { DHT11_LIMITS } from '../../model/dht11';
import { NumberProperty } from './PropertyFields';

/** Formats engine outputs and forwards controls; performs no electrical evaluation. */
export function SimulationProperties({
  component,
  simulation,
}: {
  component: ElectronicComponent;
  simulation: SimulationController;
}) {
  const { t, locale } = useLocale();
  const result = ownInput(simulation.snapshot?.components, component.id);
  const running = simulation.status === 'running';
  const pressed = ownInput(simulation.inputs.buttons, component.id) ?? false;
  const format = new Intl.NumberFormat(locale, { maximumSignificantDigits: 4 });
  const value = (reading: number | undefined, unit: string) =>
    reading === undefined ? t('unresolvedValue') : `${format.format(reading)} ${unit}`;
  const wiperRatio = component.kind === 'potentiometer' ? ownInput(simulation.inputs.potentiometers, component.id) ?? component.properties.ratio : undefined;
  const segments = component.kind === 'potentiometer' && wiperRatio !== undefined ? potentiometerResistances(component.properties.resistance, wiperRatio) : undefined;
  const board = component.kind === 'arduino-uno' || component.kind === 'esp8266';
  return (
    <section className="simulation-properties" aria-label={t('electricalResults')}>
      <h4>{t('electricalResults')}</h4>
      {result?.lcd && <dl className="electrical-values" data-testid="lcd-status">
        <div><dt>{t('lcdPower')}</dt><dd>{t(result.lcd.powered ? 'lcdPowered' : 'lcdUnpowered')}</dd></div>
        <div><dt>{t('lcdBacklight')}</dt><dd>{value(result.lcd.backlight * 100, '%')}</dd></div>
        <div><dt>{t('lcdContrast')}</dt><dd>{value(result.lcd.contrast * 100, '%')}</dd></div>
        <div><dt>{t('lcdConnection')}</dt><dd>{t(result.lcd.connection === 'parallel' ? 'lcdParallel' : result.lcd.connection === 'i2c' ? 'lcdI2c' : 'lcdNoConnection')}</dd></div>
      </dl>}
      {component.kind === 'dht11' && running && <div data-testid="dht11-live">
        <p>{t('dhtLive')}</p>
        <NumberProperty label="dhtTemperature" value={ownInput(simulation.inputs.dht11, component.id)?.temperature ?? component.properties.temperature}
          min={DHT11_LIMITS.temperatureMin} max={DHT11_LIMITS.temperatureMax} onCommit={(temperature) => simulation.setDht11(component.id, temperature, ownInput(simulation.inputs.dht11, component.id)?.humidity ?? component.properties.humidity)} />
        <NumberProperty label="dhtHumidity" value={ownInput(simulation.inputs.dht11, component.id)?.humidity ?? component.properties.humidity}
          min={DHT11_LIMITS.humidityMin} max={DHT11_LIMITS.humidityMax} onCommit={(humidity) => simulation.setDht11(component.id, ownInput(simulation.inputs.dht11, component.id)?.temperature ?? component.properties.temperature, humidity)} />
      </div>}
      {!simulation.snapshot && <p>{t('simulationReady')}</p>}
      {result && (
        <dl className="electrical-values" data-testid="electrical-values">
          <div><dt>{t('status')}</dt><dd>{t(conditionMessages[result.condition])}</dd></div>
          {!board && component.kind !== 'breadboard' && (
            <>
              <div><dt>{t(result.lcd ? 'lcdLogicVoltage' : 'voltageDrop')}</dt><dd>{value(result.voltage, 'V')}</dd></div>
              <div><dt>{t(result.lcd ? 'lcdLogicCurrent' : 'currentValue')}</dt><dd>{value(result.current, 'A')}</dd></div>
              <div><dt>{t(result.lcd ? 'lcdLogicPower' : 'powerDissipation')}</dt><dd>{value(result.power, 'W')}</dd></div>
            </>
          )}
          {component.kind === 'led' && (
            <div><dt>{t('ledBrightness')}</dt><dd>{value(result.brightness === undefined ? undefined : result.brightness * 100, '%')}</dd></div>
          )}
        </dl>
      )}
      {simulation.snapshot && !board && component.kind !== 'breadboard' && (
        <>
          <dl className="electrical-values terminal-values">
            {componentDefinitions[component.kind].pins.map((pin) => (
              <div key={pin.id}>
                <dt>{pin.id} · {t('pinVoltage')}</dt>
                <dd>{value(simulation.snapshot?.pins[pinKey(component.id, pin.id)]?.voltage, 'V')}</dd>
              </div>
            ))}
          </dl>
          <p>{t('pinReferenceNote')}</p>
        </>
      )}
      {component.kind === 'pushbutton' && (
        <>
          <button
            className="secondary-button runtime-pushbutton"
            data-testid="runtime-button"
            disabled={!running}
            aria-pressed={pressed}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              simulation.setButton(component.id, true);
            }}
            onPointerUp={() => simulation.setButton(component.id, false)}
            onPointerCancel={() => simulation.setButton(component.id, false)}
            onLostPointerCapture={() => simulation.setButton(component.id, false)}
            onBlur={() => simulation.setButton(component.id, false)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                simulation.setButton(component.id, true);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                simulation.setButton(component.id, false);
              }
            }}
          >
            {t('pressButton')}
          </button>
          <p>{t('momentaryHint')}</p>
        </>
      )}
      {component.kind === 'potentiometer' && (
        <>
        <label className="runtime-wiper">
          <span>{t('runtimeWiper')}</span>
          <input
            data-testid="runtime-wiper"
            type="range"
            min={0}
            max={1}
            step={0.01}
            disabled={!running}
            value={ownInput(simulation.inputs.potentiometers, component.id) ?? component.properties.ratio}
            onChange={(event) => simulation.setPotentiometer(component.id, Number(event.target.value))}
          />
          <output>{new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(wiperRatio ?? component.properties.ratio)}</output>
        </label>
        {segments && (
          <dl className="electrical-values" data-testid="pot-resistances">
            <div><dt>{t('potentiometerSegment1')}</dt><dd>{value(segments.toTerminal1, 'Ω')}</dd></div>
            <div><dt>{t('potentiometerSegment3')}</dt><dd>{value(segments.toTerminal3, 'Ω')}</dd></div>
          </dl>
        )}
        </>
      )}
      {board && (component.kind === 'arduino-uno' || component.kind === 'esp8266') && (
        <div className="gpio-controls">
          <h4>{t('simulationManual')}</h4>
          <p>{t('boardPowerAssumption')}</p>
          <p>{t('gpioReferenceNote')}</p>
          <p>{t('logicVoltage')}: {value(component.properties.logicVoltage, 'V')} · {t('gpioLimit')}: {value(GPIO_CURRENT_LIMIT_A[component.kind] * 1000, 'mA')}</p>
          {gpioPins(component.kind).map((pin) => {
            const configured = gpioConfiguration(component, pin, simulation.inputs);
            const reading = simulation.snapshot?.pins[pinKey(component.id, pin.id)];
            const setMode = (mode: GpioState['mode']) => simulation.setGpio(component.id, pin.id, {
              mode,
              level: mode === 'output' ? 'LOW' : 'FLOATING',
            });
            return (
              <div className="gpio-control" data-testid={`gpio-${pin.id}`} key={pin.id}>
                <strong>{pin.id} <small>GPIO{pin.gpio}</small></strong>
                <label>
                  <span>{t('gpioMode')}</span>
                  <select
                    data-testid={`gpio-mode-${pin.id}`}
                    aria-label={`${pin.id} · ${t('gpioMode')}`}
                    disabled={!running}
                    value={configured.mode}
                    onChange={(event) => {
                      const mode = event.target.value;
                      if (mode === 'input' || mode === 'input-pullup' || mode === 'output') setMode(mode);
                    }}
                  >
                    <option value="input">{t('gpioInput')}</option>
                    <option value="input-pullup" disabled={component.kind === 'esp8266' && pin.gpio === 16}>{t('gpioPullup')}</option>
                    <option value="output">{t('gpioOutput')}</option>
                  </select>
                </label>
                <label>
                  <span>{t('gpioLevel')}</span>
                  <select
                    data-testid={`gpio-level-${pin.id}`}
                    aria-label={`${pin.id} · ${t('gpioLevel')}`}
                    disabled={!running || configured.mode !== 'output'}
                    value={configured.level}
                    onChange={(event) => {
                      const level = event.target.value;
                      if (level === 'HIGH' || level === 'LOW' || level === 'FLOATING')
                        simulation.setGpio(component.id, pin.id, { mode: 'output', level });
                    }}
                  >
                    <option value="HIGH">{t('logicHigh')}</option>
                    <option value="LOW">{t('logicLow')}</option>
                    <option value="FLOATING">{t('gpioHighImpedance')}</option>
                  </select>
                </label>
                <output className="gpio-reading" aria-label={`${pin.id} · ${t('gpioReading')}`}>
                  {t(logicMessages[reading?.logic ?? 'FLOATING'])} · {value(reading?.voltage, 'V')}
                </output>
                {pin.bootLevel && <p>{t('boot')}: {pin.bootLevel}</p>}
              </div>
            );
          })}
        </div>
      )}
      <p className="simulation-model-note">{t('noPermanentDamage')}</p>
    </section>
  );
}
