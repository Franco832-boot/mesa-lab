import type { BoardProgram, SourceFile } from './types';

export const MAX_PROGRAM_SOURCE_LENGTH = 500_000;
export const MAX_PROGRAM_FILES = 40;
export type ProgramFileAction =
  | { type: 'create'; name: string }
  | { type: 'create-files'; names: readonly string[]; activeFile: string }
  | { type: 'rename'; name: string; nextName: string }
  | { type: 'delete'; name: string }
  | { type: 'select'; name: string }
  | { type: 'edit'; name: string; source: string };
export const validSourceName = (name: string): boolean =>
  name.length <= 80 && /^[A-Za-z_][A-Za-z0-9_.-]*\.(ino|h|cpp|html|css|js)$/.test(name);
export function sourceFiles(program?: BoardProgram): readonly SourceFile[] {
  return program?.files ?? [{ name: 'main.ino', source: program?.source ?? '' }];
}
export function selectedSourceFile(program?: BoardProgram): SourceFile | undefined {
  const files = sourceFiles(program);
  return program?.activeFile === null ? undefined : files.find((file) => file.name === program?.activeFile) ?? files[0];
}
/** The legacy source field is a validated projection of the first file, never a second editor buffer. */
export function validProgramFiles(program: { source: string; files?: unknown; activeFile?: unknown }): boolean {
  if (program.files === undefined) return program.activeFile === undefined;
  if (!Array.isArray(program.files) || program.files.length > MAX_PROGRAM_FILES) return false;
  const files: readonly unknown[] = program.files;
  const names = new Set<string>();
  let length = 0;
  for (const file of files) {
    if (typeof file !== 'object' || file === null || !('name' in file) || !('source' in file)
      || typeof file.name !== 'string' || typeof file.source !== 'string' || !validSourceName(file.name)
      || names.has(file.name.toLowerCase())) return false;
    names.add(file.name.toLowerCase());
    length += file.source.length;
  }
  const first = files[0];
  const firstSource = typeof first === 'object' && first !== null && 'source' in first ? first.source : '';
  return length <= MAX_PROGRAM_SOURCE_LENGTH && program.source === firstSource
    && (program.activeFile === null || files.some((file) => typeof file === 'object' && file !== null && 'name' in file && file.name === program.activeFile));
}
export function applyProgramFileAction(componentId: string, previous: BoardProgram | undefined, action: ProgramFileAction): BoardProgram {
  if (previous && previous.componentId !== componentId) throw new Error('code-target-mismatch');
  let files = sourceFiles(previous).map((file) => ({ ...file }));
  let activeFile = selectedSourceFile(previous)?.name ?? null;
  if (action.type === 'create' || action.type === 'create-files') {
    const names = action.type === 'create' ? [action.name] : action.names;
    const selected = action.type === 'create' ? action.name : action.activeFile;
    const known = new Set(files.map((file) => file.name.toLowerCase()));
    if (names.length === 0 || files.length + names.length > MAX_PROGRAM_FILES || !names.includes(selected)) throw new Error('invalid-source-name');
    for (const name of names) {
      if (!validSourceName(name) || known.has(name.toLowerCase())) throw new Error('invalid-source-name');
      known.add(name.toLowerCase());
    }
    files.push(...names.map((name) => ({ name, source: '' }))); activeFile = selected;
  } else {
    const index = files.findIndex((file) => file.name === action.name);
    if (index < 0) throw new Error('source-file-not-found');
    if (action.type === 'select') activeFile = action.name;
    else if (action.type === 'delete') {
      files = files.filter((file) => file.name !== action.name);
      if (activeFile === action.name) activeFile = files[Math.min(index, files.length - 1)]?.name ?? null;
    } else if (action.type === 'rename') {
      if (!validSourceName(action.nextName) || files.some((file, position) => position !== index && file.name.toLowerCase() === action.nextName.toLowerCase())) throw new Error('invalid-source-name');
      files = files.map((file) => file.name === action.name ? { ...file, name: action.nextName } : file);
      if (activeFile === action.name) activeFile = action.nextName;
    } else files = files.map((file) => file.name === action.name ? { ...file, source: action.source } : file);
  }
  const next: BoardProgram = { componentId, language: 'arduino-cpp', execution: 'unavailable',
    source: files[0]?.source ?? '', files, activeFile };
  if (!validProgramFiles(next)) throw new Error('invalid-program-files');
  return next;
}
