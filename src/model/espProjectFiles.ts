import type { BoardProgram } from './types';
import { selectedSourceFile, sourceFiles } from './programFiles';
import type { ProgramFileAction } from './programFiles';

/** Editor navigation conventions only; these names do not create compiler semantics. */
export const ESP_CODE_SECTIONS = ['main', 'wifi', 'functions', 'server', 'html', 'web', 'serial'] as const;
export type EspCodeSection = typeof ESP_CODE_SECTIONS[number];
export type EspFileSection = Exclude<EspCodeSection, 'serial' | 'web'>;
const sectionFiles: Readonly<Record<EspFileSection, readonly string[]>> = {
  main: ['main.ino'], wifi: ['wifi.h', 'wifi.cpp'], functions: ['functions.h', 'functions.cpp'],
  server: ['server.h', 'server.cpp'], html: ['index.html'],
};
export function espFileSection(name: string): EspFileSection {
  const lower = name.toLowerCase();
  if (/\.(html|css|js)$/.test(lower)) return 'html';
  for (const section of ['wifi', 'functions', 'server'] as const) {
    if ((section === 'functions' && /^(funciones)\.(h|cpp)$/.test(lower)) || (section === 'server' && /^(servidor)\.(h|cpp)$/.test(lower)) || sectionFiles[section].includes(lower)) return section;
  }
  // Custom files and legacy .ino modules remain reachable in the project explorer.
  return 'main';
}
export function activeEspSection(program?: BoardProgram): EspFileSection {
  const active = selectedSourceFile(program);
  return active ? espFileSection(active.name) : 'main';
}
/** Create a missing section atomically, preserving every existing source and reference. */
export function openEspSection(section: EspFileSection, program?: BoardProgram): ProgramFileAction {
  const files = sourceFiles(program);
  const active = selectedSourceFile(program);
  const existing = active && espFileSection(active.name) === section ? active
    : section === 'main' ? files.find((file) => file.name === 'main.ino') ?? files.find((file) => espFileSection(file.name) === section)
      : files.find((file) => espFileSection(file.name) === section);
  if (existing) return { type: 'select', name: existing.name };
  const names = sectionFiles[section];
  return { type: 'create-files', names, activeFile: names[0] ?? 'main.ino' };
}
