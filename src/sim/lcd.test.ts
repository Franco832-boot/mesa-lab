import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialLcd, lcdLines, writeLcdByte, writeLcdNibble } from './hd44780';
import { componentDefinitions } from '../model/components';
import { parseProject, serializeProject } from '../model/project';
import { ComponentArtwork } from '../features/components/ComponentArtwork';
import { evaluateCircuit } from './engine';
import { poweredLcd } from '../test/lcdFixture';

describe('shared HD44780 memory and 16x2 physical display', () => {
  it('maps four 20x4 rows to the same controller memory at 0x00/0x40/0x14/0x54', () => {
    let state = initialLcd();
    for (const [index, address] of [0,0x40,0x14,0x54].entries()) {
      state = writeLcdByte(state, false, 0x80 | address);
      state = writeLcdByte(state, true, 65 + index);
    }
    expect(lcdLines(state, { columns: 20, rows: 4 })).toEqual(['A','B','C','D'].map((letter) => letter + ' '.repeat(19)));
    expect([componentDefinitions['lcd-20x4'].width, componentDefinitions['lcd-20x4'].height]).toEqual([392,240]);
    const markup = renderToStaticMarkup(createElement(ComponentArtwork, { kind: 'lcd-20x4' }));
    expect((markup.match(/data-lcd-cell=/g) ?? [])).toHaveLength(80);
    expect((markup.match(/data-lcd-row=/g) ?? [])).toHaveLength(4);
  });
  it('assembles high/low nibbles, positions DDRAM, clears and homes without losing data', () => {
    let state = writeLcdByte(initialLcd(), false, 0x28);
    state = writeLcdByte(state, false, 0x0f);
    state = writeLcdNibble(state, true, 4); state = writeLcdNibble(state, true, 1);
    expect(lcdLines(state, { columns: 16, rows: 2 })[0]).toBe('A               ');
    state = writeLcdByte(state, false, 0xc3); state = writeLcdByte(state, true, 66);
    expect(lcdLines(state, { columns: 16, rows: 2 })[1]).toBe('   B            ');
    state = writeLcdByte(state, false, 2); expect(state.address).toBe(0);
    expect(state.memory[43]).toBe(66);
    expect(state).toMatchObject({ display: true, cursor: true, blink: true });
    state = writeLcdByte(state, false, 1); expect(state.memory).toEqual(Array(80).fill(32));
  });
  it('uses physical scale and exactly 32 character cells with no persisted controller text', () => {
    expect([componentDefinitions['lcd-16x2'].width, componentDefinitions['lcd-16x2'].height]).toEqual([320,144]);
    expect(componentDefinitions['lcd-16x2'].pins.map((pin) => pin.id)).toEqual(['VSS','VDD','VO','RS','RW','E','D0','D1','D2','D3','D4','D5','D6','D7','A','K']);
    const project = poweredLcd();
    expect(parseProject(serializeProject(project))).toEqual(project);
    const markup = renderToStaticMarkup(createElement(ComponentArtwork, { kind: 'lcd-16x2' }));
    expect((markup.match(/data-lcd-cell=/g) ?? [])).toHaveLength(32);
    expect((markup.match(/data-lcd-row=/g) ?? [])).toHaveLength(2);
  });
  it('gates visible memory by solved power and VO, independently of the backlight', () => {
    const project = poweredLcd();
    let state = writeLcdByte(writeLcdByte(initialLcd(), false, 0x28), false, 0x0c);
    state = writeLcdByte(state, true, 65);
    const snapshot = evaluateCircuit(project, { lcd: { lcd: state } });
    expect(snapshot.components.lcd?.lcd).toMatchObject({ powered: true, contrast: 1, backlight: 0 });
    expect(snapshot.components.lcd?.lcd?.lines[0]).toBe('A               ');
    expect(snapshot.components.lcd?.current).toBeCloseTo(5/5000, 12);
    const noPower = { ...project, wires: project.wires.filter((wire) => wire.id !== 'supply') };
    expect(evaluateCircuit(noPower, { lcd: { lcd: state } }).components.lcd?.lcd?.powered).toBe(false);
    const noContrast = { ...project, wires: project.wires.map((wire) => wire.id === 'contrast' ? { ...wire, from: { componentId: 'uno', pinId: '5V' } } : wire) };
    expect(evaluateCircuit(noContrast, { lcd: { lcd: state } }).components.lcd?.lcd?.lines[0]).toBe(' '.repeat(16));
  });
});
