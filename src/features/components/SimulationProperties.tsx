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
import type { TranslationKey } from '../../locales/es/messages';
import type { BridgeChannelState, ComponentResult } from '../../sim/types';

const motorDirectionMessages: Record<NonNullable<ComponentResult['motor']>['direction'], TranslationKey> = {
  forward: 'motorForward', reverse: 'motorReverse', stopped: 'motorStopped', unresolved: 'motorUnresolved',
};
const bridgeMessages: Record<BridgeChannelState, TranslationKey> = {
  forward: 'motorForward', reverse: 'motorReverse', brake: 'bridgeBrake', disabled: 'bridgeDisabled', invalid: 'bridgeInvalid',
};

/** Formats engine outputs and forwards controls; performs no electrical evaluation. */
export function SimulationProperties({
  component,
  simulation,
  gpioOnly = false,
}: {
  component: ElectronicComponent;
  simulation: SimulationController;
  gpioOnly?: boolean;
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
  const terminalValues = <>
    <dl className="electrical-values terminal-values">
      {componentDefinitions[component.kind].pins.map((pin) => <div key={pin.id}>
        <dt>{pin.label} · {t('pinVoltage')}</dt>
        <dd>{value(simulation.snapshot?.pins[pinKey(component.id, pin.id)]?.voltage, 'V')}</dd>
      </div>)}
    </dl>
    <p>{t('pinReferenceNote')}</p>
  </>;
  return (
    <section className="simulation-properties" aria-label={t('electricalResults')}>
      {!gpioOnly && <>
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
          {result.motor && <>
            <div><dt>{t('motorDirection')}</dt><dd data-testid="motor-direction">{t(motorDirectionMessages[result.motor.direction])}</dd></div>
            <div><dt>{t('motorSpeed')}</dt><dd data-testid="motor-speed">{value(result.motor.speed === undefined ? undefined : result.motor.speed * 100, '%')}</dd></div>
          </>}
          {result.bridge?.map((state, index) => <div key={index}>
            <dt>{t(index === 0 ? 'bridgeChannel1' : 'bridgeChannel2')}</dt><dd data-testid={`bridge-channel-${index + 1}`}>{t(bridgeMessages[state])}</dd>
          </div>)}
          {!board && component.kind !== 'breadboard' && (
            <>
              <div><dt>{t(result.lcd ? 'lcdLogicVoltage' : 'voltageDrop')}</dt><dd>{value(result.voltage, 'V')}</dd></div>
              {component.kind !== 'l293d' && <div><dt>{t(result.lcd ? 'lcdLogicCurrent' : component.kind === 'dc-motor' ? 'motorEstimatedCurrent' : 'currentValue')}</dt><dd>{value(result.current, 'A')}</dd></div>}
              <div><dt>{t(result.lcd ? 'lcdLogicPower' : component.kind === 'l293d' ? 'driverLoss' : 'powerDissipation')}</dt><dd>{value(result.power, 'W')}</dd></div>
            </>
          )}
          {component.kind === 'led' && (
            <div><dt>{t('ledBrightness')}</dt><dd>{value(result.brightness === undefined ? undefined : result.brightness * 100, '%')}</dd></div>
          )}
        </dl>
      )}
      {simulation.snapshot && !board && component.kind !== 'breadboard' && (
        component.kind === 'dc-motor' || component.kind === 'l293d' || component.kind === 'battery-9v'
          ? <details className="terminal-readings"><summary>{t('pins')}</summary>{terminalValues}</details>
          : terminalValues
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
      </>}
      {board && (component.kind === 'arduino-uno' || component.kind === 'esp8266') && (
        <div className="gpio-controls">
          {!gpioOnly && <h4>{t('simulationManual')}</h4>}
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
