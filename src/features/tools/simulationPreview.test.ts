import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/exampleProjects';
import { createEmptyProject } from '../../model/project';
import { simulationPreview } from './simulationPreview';

describe('simulation start preview choice', () => {
  it('prefers configured chat even when HTML is present or an earlier board has a web project', () => {
    const chat = createExampleProject('esp-chat-led', 'Chat');
    const web = createExampleProject('esp-web-led', 'Web');
    expect(simulationPreview(chat)).toEqual({ boardId: 'esp', section: 'chat' });
    const chatBoard = chat.components.find((board) => board.id === 'esp');
    const chatProgram = chat.programs[0];
    if (!chatBoard || !chatProgram) throw new Error('Missing chat fixture board');
    const combined = { ...web, components: [...web.components, { ...chatBoard, id: 'chat-board' }],
      programs: [...web.programs, { ...chatProgram, componentId: 'chat-board' }] };
    expect(simulationPreview(combined)).toEqual({ boardId: 'chat-board', section: 'chat' });
    expect(simulationPreview({ ...chat, programs: chat.programs.map((program) => ({ ...program,
      files: [...(program.files ?? []), { name: 'index.html', source: '<html>Web</html>' }] })) })).toEqual({ boardId: 'esp', section: 'chat' });
  });
  it('selects configured HTML and leaves projects without previews alone', () => {
    expect(simulationPreview(createExampleProject('esp-web-led', 'Web'))).toEqual({ boardId: 'esp', section: 'web' });
    expect(simulationPreview(createEmptyProject('Empty'))).toBeNull();
    expect(simulationPreview(createExampleProject('led-millis', 'Blink'))).toBeNull();
    const esp = createExampleProject('esp-web-led', 'Blank');
    expect(simulationPreview({ ...esp, programs: [] })).toBeNull();
  });
});
