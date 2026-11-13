import { advanceWifi, beginWifi, initialWifi, WIFI_STA } from './wifi';
import type { WifiState } from './wifi';
import type { SourceFile } from '../model/types';
import { initialFirmwareHttp, localHttpPath } from './httpTypes';
import type { FirmwareHttp } from './httpTypes';
import { gpioPins } from '../sim/gpio';
import { constructI2cLcd, constructLcd, lcdMethod } from './lcdRuntime';
import type { LcdObject } from './lcdRuntime';
import type { BoardKind, GpioState } from '../model/types';
import type { ValueType } from './ast';
import type { UnoProgram } from './compiler';
import { fail, MAX_ADVANCE_STEPS, MAX_AST_NODES, MAX_NESTING, MAX_SOURCE_LENGTH, UnoExecutionError } from './errors';
import type { SourceSpan } from './errors';
import { builtinEffect } from './profile';
import { binary, convert, unary } from './values';
import type { Value } from './values';
import { CLOCK_BUILTINS } from './builtins';
import type { FirmwareHost } from './ports';
import { constructDht, readDht } from './dhtRuntime';
import type { DhtObject, HardwareSample } from './dhtRuntime';
import { appendSerial, initialSerial, serialNumber } from './serial';
import type { SerialState } from './serial';
import { initialTelegram, pollTelegram, replyTelegram } from './telegram';
import type { TelegramState } from './telegram';
import { TELEGRAM_WIFI_NETWORK, WL_CONNECTED } from './wifi';

/** A polling loop runs once per virtual millisecond. This is not CPU cycle timing. */
export const LOOP_QUANTUM_US = 1000;
export interface Variable { type: ValueType; constant: boolean; value: Value | null }
export interface UnoExecution {
  resources: readonly SourceFile[];
  wifi: WifiState;
  telegram: TelegramState | null;
  texts: readonly ReadonlyMap<string, string>[];
  textOperands: readonly string[];
  http: FirmwareHttp;
  frames: readonly { pc: number; scopeDepth: number; operandDepth: number; textDepth: number }[];
  program: UnoProgram;
  board: BoardKind;
  timeUs: number;
  /** Derived compatibility projections; microseconds are authoritative. */
  timeMs: number;
  phase: 'setup' | 'loop';
  pc: number;
  wakeAtUs: number | null;
  wakeReason: 'delay' | 'cooperative' | null;
  wakeAt: number | null;
  pendingUntilUs: number | null;
  loopWaited: boolean;
  scopes: readonly ReadonlyMap<string, Variable>[];
  operands: readonly Value[];
  objects: ReadonlyMap<string, ({ type: 'dht'; value: DhtObject } | LcdObject)>;
  hardware: ReadonlyMap<string, HardwareSample>;
  serial: SerialState;
  modes: Readonly<Record<string, GpioState['mode']>>;
  levels: Readonly<Record<string, 'HIGH' | 'LOW'>>;
}
export interface UnoGpioEvent { atMs: number; pinId: string; state: GpioState }
export interface UnoAdvanceResult {
  execution: UnoExecution;
  gpio: readonly UnoGpioEvent[];
  yielded: boolean;
  steps: number;
}
export function initialExecution(program: UnoProgram, resources: readonly SourceFile[] = []): UnoExecution {
  return { resources, telegram: null, wifi: initialWifi(), texts: [new Map()], textOperands: [], http: initialFirmwareHttp(), frames: [], program, board: program.board, timeUs: 0, timeMs: 0, phase: 'setup', pc: 0,
    wakeAtUs: null, wakeReason: null, wakeAt: null, pendingUntilUs: null, loopWaited: false,
    scopes: [new Map()], operands: [], objects: new Map(), hardware: new Map(), serial: initialSerial(), modes: {}, levels: {} };
}

/** Bounded VM: even expression evaluation suspends at individual instructions. */
export function advanceArduinoMicros(previous: UnoExecution, elapsedUs: number, budget = MAX_ADVANCE_STEPS, host?: FirmwareHost): UnoAdvanceResult {
  const target = (previous.pendingUntilUs ?? previous.timeUs) + elapsedUs;
  if (!Number.isSafeInteger(elapsedUs) || elapsedUs < 0 || !Number.isSafeInteger(target)
    || !Number.isInteger(budget) || budget < 1 || budget > MAX_ADVANCE_STEPS) return fail('invalid-value');
  let timeUs = previous.timeUs, phase = previous.phase, pc = previous.pc, wakeAtUs = previous.wakeAtUs, loopWaited = previous.loopWaited;
  let wakeReason = previous.wakeReason;
  const scopes = previous.scopes.map((scope) => new Map(scope));
  const operands = [...previous.operands], modes = { ...previous.modes }, levels = { ...previous.levels };
  const gpio: UnoGpioEvent[] = [];
  const objects = new Map(previous.objects), hardware = new Map(previous.hardware);
  let serial = previous.serial, http = previous.http;
  const frames = [...previous.frames];
  const texts = previous.texts.map((scope) => new Map(scope));
  const textOperands = [...previous.textOperands];
  let wifi = previous.wifi, telegram = previous.telegram;
  let steps = 0, lcdTransfers = 0, digitalProbes = 0;
  const finish = (yielded: boolean): UnoAdvanceResult => ({
    execution: { ...previous, timeUs, timeMs: timeUs / 1000, phase, pc, wakeAtUs, wakeReason, wakeAt: wakeAtUs === null ? null : wakeAtUs / 1000,
      pendingUntilUs: yielded ? target : null, loopWaited, scopes, operands, modes, levels, objects, hardware, serial, http, frames, texts, textOperands, telegram, wifi: advanceWifi(wifi, timeUs) },
    gpio, yielded, steps,
  });
  const popText = (at: SourceSpan): string => textOperands.pop() ?? fail('type-error', at);
  const textScope = (name: string, at: SourceSpan): Map<string, string> => {
    for (let i = texts.length - 1; i >= 0; i--) {
      if (i !== 0 && frames.length && i < (frames.at(-1)?.scopeDepth ?? 0)) continue;
      const scope = texts[i];
      if (scope?.has(name)) return scope;
    }
    return fail('name-error', at);
  };
  const pop = (at: SourceSpan): Value => operands.pop() ?? fail('type-error', at);
  const locate = (name: string, at: SourceSpan): { scope: Map<string, Variable>; variable: Variable } => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (i !== 0 && frames.length && i < (frames.at(-1)?.scopeDepth ?? 0)) continue;
      const scope = scopes[i], variable = scope?.get(name);
      if (scope && variable) return { scope, variable };
    }
    return fail('name-error', at);
  };
  const read = (variable: Variable, at: SourceSpan): Value => variable.value ?? fail('type-error', at);
  const save = (name: string, value: Value, at: SourceSpan): Value => {
    const { scope, variable } = locate(name, at);
    if (variable.constant) return fail('type-error', at);
    const converted = convert(value.value, variable.type, previous.board, at);
    scope.set(name, { ...variable, value: converted }); return converted;
  };
  const repeatLoop = (at: SourceSpan) => {
    pc = previous.program.loopPc;
    if (!loopWaited) { wakeAtUs = timeUs + LOOP_QUANTUM_US; wakeReason = 'cooperative'; }
    loopWaited = false;
    if (wakeAtUs !== null && !Number.isSafeInteger(wakeAtUs)) fail('invalid-value', at);
  };
  const beginWire = () => {
    if (previous.board !== 'arduino-uno') return fail('invalid-value');
    for (const pinId of ['A4', 'A5']) {
      modes[pinId] = 'input'; levels[pinId] = 'LOW';
      gpio.push({ atMs: timeUs / 1000, pinId, state: { mode: 'input', level: 'FLOATING' } });
    }
  };
  try {
  for (;;) {
    if (wakeAtUs !== null) {
      if (wakeAtUs > target) { timeUs = target; return finish(false); }
      timeUs = wakeAtUs; wakeAtUs = null; wakeReason = null;
    }
    // LCD operations may invoke electrical probes. Bound peripheral work as
    // well as scalar instructions; long prints are compiled in 32-char chunks.
    if (steps >= budget || lcdTransfers >= 8 || digitalProbes >= 8) return finish(true);
    const instruction = previous.program.code[pc++];
    if (!instruction) return fail('unsupported-syntax');
    const at = instruction.at;
    steps++;
    switch (instruction.op) {
      case 'invoke': {
        if (frames.length >= MAX_NESTING) return fail('nesting-limit', at);
        frames.push({ pc, scopeDepth: scopes.length, operandDepth: operands.length - instruction.arity, textDepth: textOperands.length });
        pc = previous.program.functionPcs.get(instruction.name) ?? fail('name-error', at); break;
      }
      case 'missing-return': return fail('type-error', at);
      case 'while-yield': wakeAtUs = timeUs + LOOP_QUANTUM_US; wakeReason = 'cooperative'; break;
      case 'function-return': {
        const returned = instruction.value ? { type: 'bool' as const, value: Number(pop(at).value !== 0) } : null;
        const frame = frames.pop() ?? fail('type-error', at);
        scopes.splice(frame.scopeDepth); texts.splice(frame.scopeDepth); textOperands.length = frame.textDepth; operands.length = frame.operandDepth; pc = frame.pc;
        if (returned) operands.push(returned);
        if (pc === -1) return finish(false);
        break;
      }
      case 'text-push': textOperands.push(instruction.text); break;
      case 'text-load': textOperands.push(textScope(instruction.name, at).get(instruction.name) ?? fail('name-error', at)); break;
      case 'text-declare': {
        const scope = texts.at(-1) ?? fail('type-error', at);
        if (scope.has(instruction.name)) return fail('name-error', at);
        scope.set(instruction.name, popText(at)); break;
      }
      case 'text-store': {
        const value = textOperands.at(-1) ?? fail('type-error', at);
        textScope(instruction.name, at).set(instruction.name, value); break;
      }
      case 'text-drop': popText(at); break;
      case 'text-concat': {
        const right = popText(at), left = popText(at);
        if (left.length + right.length > MAX_SOURCE_LENGTH) return fail('invalid-value', at);
        textOperands.push(left + right); break;
      }
      case 'text-compare': {
        const right = popText(at), left = popText(at);
        operands.push({ type: 'bool', value: Number((left === right) !== instruction.unequal) }); break;
      }
      case 'stringify': textOperands.push(String(pop(at).value)); break;
      case 'bot-init':
        popText(at);
        telegram = initialTelegram();
        break;
      case 'bot-last-message':
        operands.push({ type: 'long', value: telegram?.lastMessageReceived ?? fail('name-error', at) }); break;
      case 'bot-field': {
        const index = pop(at).value;
        if (index !== 0 || !telegram?.message) return fail('invalid-value', at);
        textOperands.push(telegram.message[instruction.field === 'chat_id' ? 'chatId' : 'text']); break;
      }
      case 'bot-updates': {
        const offset = convert(pop(at).value, 'long', previous.board, at).value;
        if (offset < 0 || !telegram) return fail('invalid-value', at);
        wifi = advanceWifi(wifi, timeUs);
        const result = wifi.status === WL_CONNECTED ? pollTelegram(telegram, offset) : { state: telegram, count: 0 };
        telegram = result.state;
        operands.push({ type: 'int', value: result.count }); break;
      }
      case 'bot-send': {
        if (instruction.hasParseMode) popText(at);
        const text = popText(at), chatId = popText(at);
        if (!telegram) return fail('name-error', at);
        wifi = advanceWifi(wifi, timeUs);
        const next = wifi.status === WL_CONNECTED ? replyTelegram(telegram, chatId, text) : telegram;
        operands.push({ type: 'bool', value: Number(next !== telegram) });
        telegram = next;
        break;
      }
      case 'serial-value-text': serial = appendSerial(serial, textOperands.pop() ?? fail('type-error', at), instruction.newline); break;
      case 'wifi-ip': wifi = advanceWifi(wifi, timeUs); textOperands.push(wifi.ip ?? fail('wifi-disconnected', at)); break;
      case 'wifi':
        wifi = advanceWifi(wifi, timeUs);
        if (instruction.name === 'mode') {
          if (pop(at).value !== WIFI_STA) return fail('invalid-value', at);
          wifi = { ...wifi, mode: WIFI_STA }; operands.push({ type: 'bool', value: 1 });
        } else if (instruction.name === 'status') operands.push({ type: 'int', value: wifi.status });
        else if (instruction.name === 'disconnect') wifi = initialWifi();
        else {
          const password = textOperands.pop() ?? fail('type-error', at);
          const ssid = textOperands.pop() ?? fail('type-error', at);
          wifi = beginWifi(ssid, password, timeUs, host?.wifiNetwork ??
            (telegram && ssid === TELEGRAM_WIFI_NETWORK.ssid ? TELEGRAM_WIFI_NETWORK : undefined));
        }
        break;
      case 'digital-read': {
        if (host?.readDigital) digitalProbes++;
        const number = pop(at).value;
        const pin = gpioPins(previous.board).find((item) => item.gpio === number);
        if (!pin) return fail('invalid-value', at);
        const level = host?.readDigital ? host.readDigital(pin.id, gpio, timeUs) : modes[pin.id] === 'output' ? levels[pin.id] === 'HIGH' ? 1 : 0 : null;
        if (level === null) return fail('indeterminate-read', at);
        operands.push({ type: 'int', value: level }); break;
      }
      case 'fs-begin': http = { ...http, fs: true }; break;
      case 'web-route': case 'web-static': case 'web-call': case 'web-send': case 'web-file': {
        const server = Object.hasOwn(http.servers, instruction.receiver) ? http.servers[instruction.receiver] : undefined;
        if (!server) return fail('name-error', at);
        if (instruction.op === 'web-file') {
          if (http.requestServer !== instruction.receiver || http.response !== null) return fail('invalid-value', at);
          const file = http.fs ? previous.resources.find((item) => '/' + item.name === instruction.file) : undefined;
          http = { ...http, response: file ? { status: 200, contentType: instruction.contentType, body: file.source }
            : { status: 404, contentType: 'text/plain', body: '404' } };
        } else if (instruction.op === 'web-send') {
          const status = pop(at).value;
          if (http.requestServer !== instruction.receiver || http.response !== null || !Number.isInteger(status) || status < 100 || status > 599) return fail('invalid-value', at);
          http = { ...http, response: { status, contentType: instruction.contentType, body: textOperands.pop() ?? fail('type-error', at) } };
        } else {
          let next = server;
          if (instruction.op === 'web-call') next = { ...server, ...(instruction.name === 'begin' ? { began: true } : { polling: true }) };
          else {
            if (!localHttpPath(instruction.path)) return fail('invalid-value', at);
            if (!Object.hasOwn(server.routes, instruction.path) && Object.keys(server.routes).length >= 64) return fail('instruction-limit', at);
            next = { ...server, routes: { ...server.routes, [instruction.path]: instruction.op === 'web-route' ? { handler: instruction.handler } : { file: instruction.file } } };
          }
          http = { ...http, servers: { ...http.servers, [instruction.receiver]: next } };
        }
        break;
      }
      case 'wire-begin': beginWire(); break;
      case 'construct': {
        const args = operands.splice(operands.length - instruction.arity, instruction.arity).map((value) => value.value);
        if (instruction.className === 'ESP8266WebServer') {
          if (previous.board !== 'esp8266' || args[0] !== 80 || Object.keys(http.servers).length) return fail('invalid-value', at);
          http = { ...http, servers: { ...http.servers, [instruction.name]: { began: false, polling: false, routes: {} } } };
        } else if (instruction.className === 'DHT' && instruction.arity === 2) {
          objects.set(instruction.name, { type: 'dht', value: constructDht(args[0] ?? NaN, args[1] ?? NaN, previous.board, at) });
        } else if (instruction.className === 'LiquidCrystal') objects.set(instruction.name, constructLcd(args, previous.board, at));
        else if (instruction.className === 'LiquidCrystal_I2C') objects.set(instruction.name, constructI2cLcd(args, previous.board, at));
        else return fail('unsupported-syntax', at);
        break;
      }
      case 'lcd-text': case 'lcd-call': {
        lcdTransfers++;
        const object = objects.get(instruction.receiver);
        if (object?.type !== 'lcd') return fail('name-error', at);
        if (instruction.op === 'lcd-text') {
          if (object.began) host?.writeLcd?.(object.bus, { kind: 'print', text: instruction.text }, gpio);
        } else {
          const args = operands.splice(operands.length - instruction.arity, instruction.arity);
          const result = lcdMethod(object, instruction.name, args, at);
          objects.set(instruction.receiver, result.object);
          if (result.operation?.kind === 'init' && result.object.bus.kind === 'parallel') {
            for (const pinId of result.object.bus.pins) {
              modes[pinId] = 'output'; levels[pinId] = 'LOW';
              gpio.push({ atMs: timeUs / 1000, pinId, state: { mode: 'output', level: 'LOW' } });
            }
          }
          if (result.operation?.kind === 'init' && result.object.bus.kind === 'i2c') beginWire();
          if (result.operation) host?.writeLcd?.(result.object.bus, result.operation, gpio);
        }
        break;
      }
      case 'method': {
        const instance = objects.get(instruction.receiver);
        if (instance?.type !== 'dht') return fail('name-error', at);
        const object = instance.value;
        if (instruction.name === 'begin') {
          if (previous.board === 'esp8266' && object.pinId === 'D0') return fail('invalid-value', at);
          objects.set(instruction.receiver, { type: 'dht', value: { ...object, beganAtUs: timeUs, attemptAtUs: null, sample: null } });
          modes[object.pinId] = 'input-pullup'; levels[object.pinId] = 'HIGH';
          gpio.push({ atMs: timeUs / 1000, pinId: object.pinId, state: { mode: 'input-pullup', level: 'FLOATING' } });
          operands.push({ type: 'int', value: 0 });
        } else {
          const observation = host?.observeDht(object.pinId, timeUs, gpio) ?? null;
          const next = readDht(object, observation, timeUs, hardware);
          objects.set(instruction.receiver, { type: 'dht', value: next });
          operands.push({ type: 'float', value: next.sample ? instruction.name === 'readTemperature' ? next.sample.temperature : next.sample.humidity : NaN });
        }
        break;
      }
      case 'isnan': operands.push({ type: 'bool', value: Number(Number.isNaN(pop(at).value)) }); break;
      case 'serial-begin': {
        const baudRate = pop(at).value;
        if (!Number.isInteger(baudRate) || baudRate < 1 || baudRate > 2000000) return fail('invalid-value', at);
        serial = { ...serial, baudRate }; break;
      }
      case 'serial-text': serial = appendSerial(serial, instruction.text, instruction.newline); break;
      case 'serial-number': {
        const digits = instruction.digits ? pop(at).value : null;
        if (digits !== null && (!Number.isInteger(digits) || digits < 0 || digits > 9)) return fail('invalid-value', at);
        const value = pop(at);
        if (digits !== null && value.type !== 'float') return fail('type-error', at);
        serial = appendSerial(serial, serialNumber(value, digits), instruction.newline); break;
      }
      case 'push': operands.push(instruction.value); break;
      case 'load': operands.push(read(locate(instruction.name, at).variable, at)); break;
      case 'clock': operands.push({ type: 'unsigned long', value: Math.floor(timeUs / CLOCK_BUILTINS[instruction.name].divisorUs) % 0x1_0000_0000 }); break;
      case 'drop': pop(at); break;
      case 'boolean': operands.push({ type: 'bool', value: Number(pop(at).value !== 0) }); break;
      case 'unary': operands.push(unary(instruction.operator, pop(at), previous.board, at)); break;
      case 'binary': {
        const b = pop(at), a = pop(at);
        operands.push(binary(instruction.operator, a, b, previous.board, at)); break;
      }
      case 'declare': {
        const value = instruction.initialized ? convert(pop(at).value, instruction.valueType, previous.board, at)
          : instruction.global ? convert(0, instruction.valueType, previous.board, at) : null;
        const scope = scopes.at(-1) ?? fail('type-error', at);
        if (scope.has(instruction.name)) return fail('name-error', at);
        scope.set(instruction.name, { type: instruction.valueType, constant: instruction.constant, value }); break;
      }
      case 'store': {
        let value = pop(at);
        if (instruction.compound) value = binary(instruction.compound, read(locate(instruction.name, at).variable, at), value, previous.board, at);
        operands.push(save(instruction.name, value, at)); break;
      }
      case 'update': {
        const before = read(locate(instruction.name, at).variable, at);
        const after = save(instruction.name, binary('+', before, { type: 'int', value: instruction.delta }, previous.board, at), at);
        operands.push(instruction.prefix ? after : before); break;
      }
      case 'jump': pc = instruction.target; break;
      case 'branch': if ((pop(at).value !== 0) === instruction.when) pc = instruction.target; break;
      case 'enter': scopes.push(new Map()); texts.push(new Map()); break;
      case 'leave': if (scopes.length < 2) return fail('type-error', at); scopes.pop(); texts.pop(); break;
      case 'start-loop': phase = 'loop'; loopWaited = false; break;
      case 'return':
        scopes.splice(1); texts.splice(1); operands.length = 0; textOperands.length = 0;
        if (phase === 'setup') { phase = 'loop'; pc = previous.program.loopPc; loopWaited = false; }
        else repeatLoop(at);
        break;
      case 'repeat':
        repeatLoop(at);
        break;
      case 'call': {
        const args = operands.splice(operands.length - instruction.arity, instruction.arity);
        const effect = builtinEffect(instruction.name, args, previous.board, at);
        if (effect.kind === 'wait') {
          wakeAtUs = timeUs + effect.microseconds;
          wakeReason = 'delay';
          if (!Number.isSafeInteger(wakeAtUs)) return fail('invalid-value', at);
          if (phase === 'loop' && effect.microseconds > 0) loopWaited = true;
        } else if (effect.kind === 'pwm') {
          modes[effect.pinId] = 'output';
          const level = effect.value === 0 || (effect.periodUs === null && effect.value < 128) ? 'LOW' : 'HIGH';
          levels[effect.pinId] = level;
          gpio.push({ atMs: timeUs / 1000, pinId: effect.pinId, state: { mode: 'output', level,
            ...(effect.periodUs !== null && effect.value > 0 && effect.value < 255
              ? { pwm: { value: effect.value, periodUs: effect.periodUs } } : {}) } });
        } else if (effect.kind === 'mode') {
          modes[effect.pinId] = effect.mode;
          if (effect.mode === 'input' && previous.board === 'arduino-uno') levels[effect.pinId] = 'LOW';
          gpio.push({ atMs: timeUs / 1000, pinId: effect.pinId, state: { mode: effect.mode,
            level: effect.mode === 'input' ? 'FLOATING' : levels[effect.pinId] ?? 'LOW' } });
        } else {
          if (modes[effect.pinId] !== 'output') return fail('pin-not-output', at);
          levels[effect.pinId] = effect.level;
          gpio.push({ atMs: timeUs / 1000, pinId: effect.pinId, state: { mode: 'output', level: effect.level } });
        }
        break;
      }
    }
    if (operands.length + textOperands.length > MAX_AST_NODES) return fail('step-limit', at);
  }
  } catch (error: unknown) {
    if (error instanceof UnoExecutionError) error.serial = serial;
    throw error;
  }
}

export function advanceArduino(previous: UnoExecution, elapsedMs: number, budget = MAX_ADVANCE_STEPS, host?: FirmwareHost): UnoAdvanceResult {
  const scaled = elapsedMs * 1000, microseconds = Math.round(scaled);
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || Math.abs(scaled - microseconds) > 0.000001) return fail('invalid-value');
  return advanceArduinoMicros(previous, microseconds, budget, host);
}
