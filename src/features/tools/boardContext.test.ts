import { describe, expect, it } from 'vitest';
import { createComponent } from '../../model/components';
import type { ElectronicComponent } from '../../model/types';
import {
  boardDisplayLabel,
  initialBoardContext,
  reconcileBoardContext,
  selectContextBoard,
  synchronizeBoardContext,
} from './boardContext';
import type { ContextBoard } from './boardContext';

const uno: ContextBoard = { id: 'uno', kind: 'arduino-uno', position: { x: 0, y: 0 }, rotation: 0, properties: { logicVoltage: 5 } };
const esp1: ContextBoard = { id: 'esp-1', kind: 'esp8266', position: { x: 10, y: 0 }, rotation: 0, properties: { logicVoltage: 3.3 } };
const esp2: ContextBoard = { ...esp1, id: 'esp-2' };
const led = createComponent('led', { x: 20, y: 0 }, 'led');
const components: ElectronicComponent[] = [uno, led, esp1, esp2];

describe('shared board tools context', () => {
  it('has an empty context when no compatible board exists', () => {
    expect(initialBoardContext('p', [led])).toEqual({ projectIdentity: 'p', activeBoardId: null, recentBoardIds: [], canvasSelectionId: null });
  });
  it('uses first-board fallback and respects an initially selected board', () => {
    expect(initialBoardContext('p', components).activeBoardId).toBe('uno');
    expect(initialBoardContext('p', components, 'esp-2').activeBoardId).toBe('esp-2');
    expect(initialBoardContext('p', components, 'led').activeBoardId).toBe('uno');
  });
  it('tracks actual canvas board selection but preserves context after selecting a non-board', () => {
    let context = initialBoardContext('p', components);
    context = synchronizeBoardContext(context, 'p', components, 'esp-1');
    expect(context.activeBoardId).toBe('esp-1');
    context = synchronizeBoardContext(context, 'p', components, 'led');
    expect(context.activeBoardId).toBe('esp-1');
    expect(context.recentBoardIds).toEqual(['esp-1']);
  });
  it('retains a manual selector choice when selected-board properties change', () => {
    let context = initialBoardContext('p', components, 'esp-1');
    context = selectContextBoard(context, 'uno', components);
    const changed = components.map((component) => ({ ...component, position: { x: 40, y: 50 } }));
    expect(synchronizeBoardContext(context, 'p', changed, 'esp-1')).toBe(context);
    expect(context.activeBoardId).toBe('uno');
  });
  it('accepts reselecting the same canvas board after a manual switch', () => {
    let context = initialBoardContext('p', components, 'esp-1');
    context = selectContextBoard(context, 'uno', components);
    // The canvas ID prop has not changed; the explicit canvas event is still meaningful.
    context = selectContextBoard(context, 'esp-1', components);
    expect(context.activeBoardId).toBe('esp-1');
    expect(context.recentBoardIds).toEqual(['esp-1', 'uno']);
  });
  it('falls back through most-recent boards after deletion, then the first available board', () => {
    let context = initialBoardContext('p', components);
    context = selectContextBoard(context, 'esp-2', components);
    context = selectContextBoard(context, 'uno', components);
    context = selectContextBoard(context, 'esp-1', components);
    context = reconcileBoardContext(context, 'p', [uno, led, esp2]);
    expect(context.activeBoardId).toBe('uno');
    context = reconcileBoardContext(context, 'p', [led, esp2]);
    expect(context.activeBoardId).toBe('esp-2');
    context = reconcileBoardContext(context, 'p', [led, { ...esp1, id: 'new-esp' }]);
    expect(context.activeBoardId).toBe('new-esp');
    expect(context.recentBoardIds).toEqual([]);
    expect(reconcileBoardContext(context, 'p', [led]).activeBoardId).toBeNull();
  });
  it('clears MRU and stale canvas selection intent on project or import identity changes', () => {
    const previous = selectContextBoard(initialBoardContext('p:1', components), 'esp-2', components);
    const next = synchronizeBoardContext(previous, 'p:2', components, 'esp-2');
    expect(next.activeBoardId).toBe('uno');
    expect(next.recentBoardIds).toEqual([]);
    expect(synchronizeBoardContext(next, 'p:2', components, 'esp-2')).toBe(next);
  });
  it('ignores invalid/non-board IDs and avoids redundant state transitions', () => {
    const initial = initialBoardContext('p', components);
    expect(selectContextBoard(initial, 'missing', components)).toBe(initial);
    expect(selectContextBoard(initial, 'led', components)).toBe(initial);
    const selected = selectContextBoard(initial, 'uno', components);
    expect(selectContextBoard(selected, 'uno', components)).toBe(selected);
    expect(reconcileBoardContext(selected, 'p', [...components])).toBe(selected);
  });
  it('disambiguates duplicate hardware names without changing stable identifiers', () => {
    expect(boardDisplayLabel(esp1, [uno, esp1, esp2])).toBe('ESP8266 #1 · esp-1');
    expect(boardDisplayLabel(esp2, [uno, esp1, esp2])).toBe('ESP8266 #2 · esp-2');
    expect(boardDisplayLabel(uno, [uno, esp1, esp2])).toBe('Arduino UNO #1 · uno');
  });
});
