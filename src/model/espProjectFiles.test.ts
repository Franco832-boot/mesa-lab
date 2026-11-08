import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { activeEspSection, espFileSection, openEspSection } from './espProjectFiles';
import { applyProgramFileAction, MAX_PROGRAM_FILES, sourceFiles } from './programFiles';
import type { BoardProgram } from './types';
import { createComponent } from './components';
import { createProject, parseProject, serializeProject } from './project';
import { editorCommandApplied, projectReducer, projectReplaced, undoApplied, redoApplied } from '../features/project/projectSlice';

const legacy: BoardProgram = { componentId: 'esp', language: 'arduino-cpp', execution: 'unavailable', source: '// existing main' };
describe('ESP project file organization without compilation semantics', () => {
  it('creates real headers/implementations in one action and preserves legacy source', () => {
    const next = applyProgramFileAction('esp', legacy, openEspSection('wifi', legacy));
    expect(next.files).toEqual([
      { name: 'main.ino', source: '// existing main' }, { name: 'wifi.h', source: '' }, { name: 'wifi.cpp', source: '' },
    ]);
    expect(next.activeFile).toBe('wifi.h');
    expect(next.source).toBe(legacy.source);
    expect(activeEspSection(next)).toBe('wifi');
    expect(legacy.files).toBeUndefined();
  });
  it('selects an existing module without adding files or overwriting user code', () => {
    const existing = applyProgramFileAction('esp', legacy, { type: 'create', name: 'WiFi.cpp' });
    const saved = applyProgramFileAction('esp', existing, { type: 'edit', name: 'WiFi.cpp', source: '#include "wifi.h"\nvoid connectWifi() {}' });
    const action = openEspSection('wifi', saved);
    expect(action).toEqual({ type: 'select', name: 'WiFi.cpp' });
    expect(applyProgramFileAction('esp', saved, action).files).toEqual(saved.files);
    expect(espFileSection('styles.css')).toBe('html');
    expect(espFileSection('app.js')).toBe('html');
    expect(espFileSection('custom-driver.cpp')).toBe('main');
    expect(espFileSection('server.ino')).toBe('main');
  });
  it('saves ordinary includes, declarations and calls verbatim, plus a web resource in one board program', () => {
    let saved = legacy;
    for (const section of ['wifi', 'functions', 'server', 'html'] as const)
      saved = applyProgramFileAction('esp', saved, openEspSection(section, saved));
    for (const [name, source] of [
      ['main.ino', '#include "wifi.h"\n#include "functions.h"\n#include "server.h"\nvoid setup(){connectWifi();startServer();}\nvoid loop(){updateSensors();}'],
      ['wifi.h', '#pragma once\nvoid connectWifi();'],
      ['wifi.cpp', '#include "wifi.h"\n#include <ESP8266WiFi.h>\nvoid connectWifi(){WiFi.begin("Lab", "fictional");}'],
      ['functions.h', '#pragma once\nvoid updateSensors();'],
      ['functions.cpp', '#include "functions.h"\nvoid updateSensors() {}'],
      ['server.h', '#pragma once\nvoid startServer();'],
      ['server.cpp', '#include "server.h"\nvoid startServer() {}'],
      ['index.html', '<button id="led">LED</button>'],
    ] as const) {
      saved = applyProgramFileAction('esp', saved, { type: 'edit', name, source });
    }
    const doc = { ...createProject('esp-files'), components: [createComponent('esp8266', { x: 0, y: 0 }, 'esp')], programs: [saved] };
    const restored = parseProject(serializeProject(doc));
    expect(restored.version).toBe(1);
    expect(restored.programs).toEqual([saved]);
    expect(sourceFiles(saved).map((file) => file.name)).toEqual([
      'main.ino', 'wifi.h', 'wifi.cpp', 'functions.h', 'functions.cpp', 'server.h', 'server.cpp', 'index.html',
    ]);
  });
  it('rejects a pair exceeding the file limit atomically and validates duplicate/invalid batch names', () => {
    let saved = legacy;
    for (let index = 1; index < MAX_PROGRAM_FILES - 1; index++)
      saved = applyProgramFileAction('esp', saved, { type: 'create', name: `module${index}.h` });
    const before = JSON.stringify(saved);
    expect(() => applyProgramFileAction('esp', saved, openEspSection('server', saved))).toThrow('invalid-source-name');
    expect(JSON.stringify(saved)).toBe(before);
    for (const names of [[], ['ok.h', 'OK.h'], ['ok.h', '../bad.cpp'], ['ok.h', 'main.ino']])
      expect(() => applyProgramFileAction('esp', legacy, { type: 'create-files', names, activeFile: 'ok.h' })).toThrow();
    expect(() => applyProgramFileAction('esp', legacy, { type: 'create-files', names: ['ok.h'], activeFile: 'missing.h' })).toThrow();
  });
  it('undoes/redoes a module pair together and retains physical circuit references', () => {
    const doc = { ...createProject('history'), components: [createComponent('esp8266', { x: 5, y: 8 }, 'esp')], programs: [legacy] };
    const store = configureStore({ reducer: { project: projectReducer } });
    store.dispatch(projectReplaced(doc));
    const before = store.getState().project.document;
    store.dispatch(editorCommandApplied({ type: 'program-file', id: 'esp', action: openEspSection('functions', legacy) }));
    const next = store.getState().project.document;
    expect(next.components).toBe(before.components);
    expect(next.wires).toBe(before.wires);
    expect(next.viewport).toBe(before.viewport);
    expect(next.programs[0]?.files).toHaveLength(3);
    expect(store.getState().project.history.past).toHaveLength(1);
    store.dispatch(undoApplied()); expect(store.getState().project.document.programs).toEqual([legacy]);
    store.dispatch(redoApplied()); expect(store.getState().project.document.programs).toEqual(next.programs);
  });
});
