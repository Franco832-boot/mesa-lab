import { describe, expect, it, vi } from 'vitest';
import { usesTelegramBot } from '../../firmware/projectCompiler';
import { createExampleProject } from '../../model/exampleProjects';
import { serializeProject } from '../../model/project';
import { pinKey } from '../../sim/topology';
import { nextFirmwareDelay } from './firmwareRuntime';
import { initialSimulation, transitionSimulation } from './runtime';
import type { SimulationEvent } from './runtime';

function fixture() {
  const project = createExampleProject('esp-chat-led', 'Chat LED', 'chat-test');
  const source = project.programs[0]?.source ?? '';
  let state = initialSimulation();
  const dispatch = (event: SimulationEvent) => { state = transitionSimulation(state, event, project); };
  return {
    project, source, dispatch,
    run: (code = source) => dispatch({ type: 'firmware-run', componentId: 'esp', source: code }),
    send: (text: string, chatId = '123456') => dispatch({ type: 'firmware-chat', componentId: 'esp', text, chatId }),
    advance: (elapsedMs: number) => {
      dispatch({ type: 'firmware-advance', elapsedMs });
      for (let slices = 0; nextFirmwareDelay(state) === 0; slices++) {
        if (slices >= 20) throw new Error('Firmware did not reach its deadline');
        dispatch({ type: 'firmware-advance', elapsedMs: 0 });
      }
    },
    get state() { return state; },
    get execution() { return state.firmware.esp?.execution; },
    get replies() { return state.firmware.esp?.execution?.telegram?.history.filter((item) => item.from === 'bot') ?? []; },
  };
}

describe('ESP8266 Chat-Simulation', () => {
  it('detects bot construction in linked Arduino code and ignores an include, a comment and an unlinked header', () => {
    const { source } = fixture();
    const includeOnly = '#include <UniversalTelegramBot.h>\nvoid setup() {}\nvoid loop() {}';
    const main = (source: string) => ({ name: 'main.ino', source });
    expect(usesTelegramBot([main(source)])).toBe(true);
    expect(usesTelegramBot([main(includeOnly)])).toBe(false);
    expect(usesTelegramBot([main(`/* ${source} */\n${includeOnly}`)])).toBe(false);
    expect(usesTelegramBot([main(includeOnly), { name: 'unused.h', source }])).toBe(false);
    expect(usesTelegramBot([main('#include "bot.h"'), { name: 'bot.h', source }])).toBe(true);
  });

  it('runs the example end to end, polls on virtual time, and acknowledges messages once', () => {
    const lab = fixture(), before = serializeProject(lab.project);
    const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Unexpected network request'); });
    try {
      lab.run();
      lab.send('/start');
      lab.send('/encender');
      lab.advance(499);
      expect(lab.execution?.wifi.status).toBe(3);
      expect(lab.replies).toHaveLength(0);
      expect(lab.state.snapshot?.components.led?.brightness).toBe(0);
      lab.advance(10);
      expect(lab.replies.map((item) => item.text)).toEqual([expect.stringContaining('Comandos disponibles'), 'LED encendido.']);
      expect(lab.state.inputs.gpio?.[pinKey('esp', 'D5')]).toEqual({ mode: 'output', level: 'HIGH' });
      // 3.3 V output, 2 V LED drop, 50 Ω board output and 220 Ω series resistor.
      expect(lab.state.snapshot?.components.led?.current).toBeCloseTo((3.3 - 2) / (50 + 220), 10);
      expect(lab.execution?.telegram?.lastMessageReceived).toBe(2);
      expect(lab.execution?.telegram?.pending).toEqual([]);
      lab.send('/estado');
      lab.send('/apagar', '123457');
      lab.send('/desconocido');
      lab.advance(510);
      expect(lab.replies.slice(2).map(({ chatId, text }) => [chatId, text])).toEqual([
        ['123456', 'El LED está encendido.'], ['123457', 'Usuario no autorizado.'],
        ['123456', 'Comando desconocido. Escribí /start.'],
      ]);
      expect(lab.state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
      lab.send('/apagar');
      lab.send('/estado');
      lab.advance(510);
      expect(lab.replies.slice(-2).map((item) => item.text)).toEqual(['LED apagado.', 'El LED está apagado.']);
      expect(lab.state.inputs.gpio?.[pinKey('esp', 'D5')]?.level).toBe('LOW');
      expect(lab.state.snapshot?.components.led?.current).toBe(0);
      lab.advance(510);
      expect(lab.replies).toHaveLength(7);
      expect(network).not.toHaveBeenCalled();
      expect(serializeProject(lab.project)).toBe(before);
    } finally {
      network.mockRestore();
    }
  });

  it('holds the queue and GPIO while paused, then starts a fresh session with edited Arduino', () => {
    const lab = fixture();
    lab.run();
    lab.send('/encender');
    lab.dispatch({ type: 'pause' });
    const paused = lab.state;
    lab.send('/apagar');
    lab.advance(1000);
    expect(lab.state).toBe(paused);
    lab.dispatch({ type: 'start' });
    lab.advance(510);
    expect(lab.replies.map((item) => item.text)).toEqual(['LED encendido.']);
    lab.dispatch({ type: 'stop' });
    expect(lab.state).toEqual(initialSimulation());
    lab.run(lab.source.replace('texto == "/encender"', 'texto == "/luz"').replace('LED encendido.', 'Luz por código.'));
    expect(lab.execution?.telegram?.history).toEqual([]);
    lab.send('/encender');
    lab.advance(510);
    expect(lab.replies[0]?.text).toContain('Comando desconocido');
    expect(lab.state.snapshot?.components.led?.brightness).toBe(0);
    lab.send('/luz');
    lab.advance(510);
    expect(lab.replies.at(-1)?.text).toBe('Luz por código.');
    expect(lab.state.snapshot?.components.led?.brightness).toBeGreaterThan(0);
  });
});
