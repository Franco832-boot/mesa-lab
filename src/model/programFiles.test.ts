import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { createComponent } from './components';
import { applyEditorCommand } from './editor';
import { createProject, parseProject, serializeProject } from './project';
import { applyProgramFileAction, MAX_PROGRAM_SOURCE_LENGTH, selectedSourceFile, sourceFiles } from './programFiles';
import type { ProgramFileAction } from './programFiles';
import { editorCommandApplied, projectReducer, projectReplaced, redoApplied, undoApplied } from '../features/project/projectSlice';
import { createAppStore } from '../app/store';
import { migratePersistedProject } from '../app/persistence';
import type { BoardProgram, CircuitProject } from './types';
import { openEspSection } from './espProjectFiles';

const fixture = (): CircuitProject => ({ ...createProject('files'), components: [
  createComponent('arduino-uno', { x: 10, y: 20 }, 'uno'), createComponent('esp8266', { x: 300, y: 20 }, 'esp'),
], wires: [], programs: [] });
const command = (id: string, action: ProgramFileAction) => ({ type: 'program-file' as const, id, action });
const legacy: BoardProgram = { componentId: 'uno', language: 'arduino-cpp', execution: 'unavailable', source: '// saved Arduino code' };

describe('per-board source files', () => {
  it('migrates legacy single-source code to main.ino without losing its content', () => {
    const old = { ...fixture(), programs: [legacy] };
    expect(parseProject(serializeProject(old))).toEqual(old);
    expect(sourceFiles(legacy)).toEqual([{ name: 'main.ino', source: legacy.source }]);
    const updated = applyEditorCommand(old, command('uno', { type: 'create', name: 'config.h' }));
    expect(updated.programs[0]?.files).toEqual([{ name: 'main.ino', source: legacy.source }, { name: 'config.h', source: '' }]);
    expect(migratePersistedProject({ document: old, _persist: { version: 1 } }).document).toEqual(old);
    expect(parseProject(serializeProject(updated))).toEqual(updated);
  });
  it('creates, edits and switches independent UNO and ESP files, retaining active files after reload', () => {
    let doc = applyEditorCommand(fixture(), command('uno', { type: 'edit', name: 'main.ino', source: 'void setup() {}\nvoid loop() {}' }));
    doc = applyEditorCommand(doc, command('uno', { type: 'create', name: 'config.h' }));
    doc = applyEditorCommand(doc, command('uno', { type: 'edit', name: 'config.h', source: '#define LED_PIN 13' }));
    doc = applyEditorCommand(doc, command('esp', { type: 'edit', name: 'main.ino', source: '// independent ESP' }));
    for (const name of ['module.cpp', 'module.h', 'index.html', 'styles.css', 'app.js']) {
      doc = applyEditorCommand(doc, command('esp', { type: 'create', name }));
      doc = applyEditorCommand(doc, command('esp', { type: 'edit', name, source: `content of ${name}` }));
    }
    doc = applyEditorCommand(doc, command('uno', { type: 'select', name: 'main.ino' }));
    const loaded = parseProject(serializeProject(doc));
    const uno = loaded.programs.find((program) => program.componentId === 'uno');
    const esp = loaded.programs.find((program) => program.componentId === 'esp');
    expect(selectedSourceFile(uno)?.name).toBe('main.ino');
    expect(uno?.files?.find((file) => file.name === 'config.h')?.source).toBe('#define LED_PIN 13');
    expect(selectedSourceFile(esp)).toEqual({ name: 'app.js', source: 'content of app.js' });
    expect(esp?.files?.some((file) => file.name === 'config.h')).toBe(false);
  });
  it('renames and deletes only the targeted file, including deleting the final file', () => {
    let program = applyProgramFileAction('uno', legacy, { type: 'rename', name: 'main.ino', nextName: 'blink.ino' });
    expect(selectedSourceFile(program)?.name).toBe('blink.ino');
    expect(program.source).toBe(legacy.source);
    program = applyProgramFileAction('uno', program, { type: 'delete', name: 'blink.ino' });
    expect(program.files).toEqual([]);
    expect(program.activeFile).toBeNull();
    expect(selectedSourceFile(program)).toBeUndefined();
    program = applyProgramFileAction('uno', program, { type: 'create', name: 'main.ino' });
    expect(selectedSourceFile(program)).toEqual({ name: 'main.ino', source: '' });
  });
  it('validates names, duplicates, missing references and size without mutating the previous program', () => {
    const before = JSON.stringify(legacy);
    for (const name of ['../config.h', 'dir/code.cpp', 'bad.exe', 'main.ino', 'MAIN.ino', 'bad file.js'])
      expect(() => applyProgramFileAction('uno', legacy, { type: 'create', name })).toThrow();
    expect(() => applyProgramFileAction('uno', legacy, { type: 'edit', name: 'missing.h', source: 'x' })).toThrow();
    expect(() => applyProgramFileAction('esp', legacy, { type: 'create', name: 'config.h' })).toThrow();
    expect(() => applyProgramFileAction('uno', legacy, { type: 'edit', name: 'main.ino', source: 'x'.repeat(MAX_PROGRAM_SOURCE_LENGTH + 1) })).toThrow();
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('rejects inconsistent imported source mirrors and invalid active files', () => {
    const program = applyProgramFileAction('uno', legacy, { type: 'create', name: 'config.h' });
    for (const invalid of [{ ...program, source: 'inconsistent' }, { ...program, activeFile: 'missing.cpp' },
      { ...program, files: [{ name: '../bad.js', source: legacy.source }] }])
      expect(() => parseProject(JSON.stringify({ ...fixture(), programs: [invalid] }))).toThrow();
  });
  it('preserves electrical/viewport references and supports undo/redo of file deletion', () => {
    const doc = fixture();
    const created = applyEditorCommand(doc, command('uno', { type: 'create', name: 'config.h' }));
    expect(created.components).toBe(doc.components); expect(created.wires).toBe(doc.wires); expect(created.viewport).toBe(doc.viewport);
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(projectReplaced(created));
    store.dispatch(editorCommandApplied(command('uno', { type: 'delete', name: 'config.h' })));
    expect(store.getState().project.document.programs[0]?.files).toHaveLength(1);
    store.dispatch(undoApplied()); expect(store.getState().project.document.programs[0]?.files).toHaveLength(2);
    store.dispatch(redoApplied()); expect(store.getState().project.document.programs[0]?.files).toHaveLength(1);
  });
  it('keeps legacy source edits compatible without discarding additional files', () => {
    const created = applyEditorCommand({ ...fixture(), programs: [legacy] }, command('uno', { type: 'create', name: 'config.h' }));
    const updated = applyEditorCommand(created, { type: 'program', id: 'uno', source: '// updated main' });
    expect(updated.programs[0]?.files).toEqual([{ name: 'main.ino', source: '// updated main' }, { name: 'config.h', source: '' }]);
  });
  it('recovers both board projects through real Redux Persist save/reload', async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const open = async () => {
      const app = createAppStore(storage);
      await new Promise<void>((resolve) => {
        if (app.persistor.getState().bootstrapped) { resolve(); return; }
        const unsubscribe = app.persistor.subscribe(() => { if (app.persistor.getState().bootstrapped) { unsubscribe(); resolve(); } });
      });
      return app;
    };
    const first = await open();
    let second: Awaited<ReturnType<typeof open>> | undefined;
    try {
      first.store.dispatch(projectReplaced(fixture()));
      first.store.dispatch(editorCommandApplied(command('uno', { type: 'edit', name: 'main.ino', source: '// UNO main' })));
      first.store.dispatch(editorCommandApplied(command('uno', { type: 'create', name: 'config.h' })));
      first.store.dispatch(editorCommandApplied(command('uno', { type: 'edit', name: 'config.h', source: '// UNO configuration' })));
      for (const section of ['wifi', 'functions', 'server', 'html'] as const) {
        const program = first.store.getState().project.document.programs.find((item) => item.componentId === 'esp');
        first.store.dispatch(editorCommandApplied(command('esp', openEspSection(section, program))));
      }
      first.store.dispatch(editorCommandApplied(command('esp', { type: 'edit', name: 'main.ino', source: '#include "wifi.h"\nvoid setup(){connectWifi();}\nvoid loop(){}' })));
      first.store.dispatch(editorCommandApplied(command('esp', { type: 'edit', name: 'wifi.h', source: '#pragma once\nvoid connectWifi();' })));
      first.store.dispatch(editorCommandApplied(command('esp', { type: 'edit', name: 'wifi.cpp', source: '#include "wifi.h"\nvoid connectWifi(){}' })));
      first.store.dispatch(editorCommandApplied(command('esp', { type: 'edit', name: 'index.html', source: '<button>ESP only</button>' })));
      await first.saveNow(); first.persistor.pause();
      second = await open();
      expect(second.store.getState().project.document.programs).toEqual(first.store.getState().project.document.programs);
      expect(selectedSourceFile(second.store.getState().project.document.programs.find((program) => program.componentId === 'uno'))?.source).toBe('// UNO configuration');
      expect(selectedSourceFile(second.store.getState().project.document.programs.find((program) => program.componentId === 'esp'))?.source).toBe('<button>ESP only</button>');
      expect(second.store.getState().project.document.programs.find((program) => program.componentId === 'esp')?.files).toHaveLength(8);
    } finally { first.persistor.pause(); second?.persistor.pause(); await first.persistor.flush(); await second?.persistor.flush(); }
  });
});
