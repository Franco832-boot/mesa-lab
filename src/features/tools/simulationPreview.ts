import { usesTelegramBot } from '../../firmware/projectCompiler';
import { sourceFiles } from '../../model/programFiles';
import type { CircuitProject } from '../../model/types';

export interface SimulationPreview { boardId: string; section: 'chat' | 'web' }
export interface PreviewRequest extends SimulationPreview { sequence: number }

/** Prefer chat across all ESP boards before falling back to configured HTML. */
export function simulationPreview(project: CircuitProject): SimulationPreview | null {
  let web: SimulationPreview | null = null;
  for (const board of project.components) {
    if (board.kind !== 'esp8266') continue;
    const files = sourceFiles(project.programs.find((program) => program.componentId === board.id));
    if (usesTelegramBot(files)) return { boardId: board.id, section: 'chat' };
    if (!web && files.some((file) => file.source.trim() && (/\.html?$/i.test(file.name) || /<!doctype\s+html|<html\b|["']text\/html["']/i.test(file.source))))
      web = { boardId: board.id, section: 'web' };
  }
  return web;
}
