import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useLocale } from '../locales/useLocale';
import type { TranslationKey } from '../locales/es/messages';
import { Icon } from '../shared/Icon';
import { Dialog } from '../shared/Dialog';
import { HelpDialog } from './HelpDialog';
import type { CircuitProject, ComponentKind, ElectronicComponent, PinReference, Point, Wire } from '../model/types';
import { componentDefinitions, createComponent } from '../model/components';
import type { LedColor } from '../model/components';
import { screenToWorld } from '../model/coordinates';
import { useCircuitEditor } from '../features/project/useCircuitEditor';
import { WireInspector } from '../features/components/WireInspector';
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from '../model/project';
import { sourceFiles } from '../model/programFiles';
import { useProject } from '../features/project/useProject';
import { ComponentLibrary } from '../features/components/ComponentLibrary';
import { Inspector } from '../features/components/Inspector';
import { ContextualInspector } from '../features/components/ContextualInspector';
import { ToolSidebar } from '../features/tools/ToolSidebar';
import { ProjectLibrary } from '../features/examples/ProjectLibrary';
import { preserveBeforeExample } from '../features/examples/replacement';
import { examplePaths, localProjectPath } from './projectRoutes';
import { useProjectRoutes } from './useProjectRoutes';
import { useProjectCopies } from '../features/examples/useProjectCopies';
import { useWorkspacePanels } from '../features/tools/useWorkspacePanels';
import { MobileWorkspaceNav } from '../features/tools/MobileWorkspaceNav';
import { useVisualViewport } from '../shared/useVisualViewport';
import { useBoardContext } from '../features/tools/useBoardContext';
import { CodeWorkspace } from '../features/tools/CodeWorkspace';
import { simulationPreview } from '../features/tools/simulationPreview';
import type { PreviewRequest } from '../features/tools/simulationPreview';
import { Workspace } from '../features/workspace/Workspace';
import { useSimulation } from '../features/simulation/useSimulation';
import { ownInput } from '../sim/topology';
import { statusMessages } from '../features/simulation/messages';

import { SimulationConsole } from '../features/simulation/SimulationConsole';
import { componentScreenBounds } from '../features/components/inspectorPlacement';
import { CodeExportDialog } from '../features/codeExport/CodeExportDialog';

export function App({ saveNow }: { saveNow: () => Promise<boolean> }) {
  const { t, locale, setLocale } = useLocale();
  const {
    project,
    saved,
    saveStatus,
    revision,
    initialIssue,
    autoFit,
    canUndo,
    canRedo,
    updateName,
    updateViewport,
    load,
    reset,
  } = useProject();
  const tools = useWorkspacePanels();
  useVisualViewport();
  const libraryOpen = tools.open;
  const setLibraryOpen = tools.setOpen;
  const { projectsOpen, setProjectsOpen } = tools;
  const [previewRevealSequence, setPreviewRevealSequence] = useState(0);
  const [previewRequest, setPreviewRequest] = useState<PreviewRequest | undefined>();
  const projectCopies = useProjectCopies(projectsOpen, revision);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const toolTab = tools.tab;
  const setToolTab = tools.setTab;
  const [inspectorDockOffset, setInspectorDockOffset] = useState(0);
  const [toolDockOffset, setToolDockOffset] = useState(0);
  const libraryToggleRef = useRef<HTMLButtonElement>(null);
  const [inspectedKind, setInspectedKind] = useState<ComponentKind>('esp8266');
  const [wireColor, setWireColor] = useState('#668c75');
  const [connectionRequest, setConnectionRequest] = useState<PinReference | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState(true);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [codeExport, setCodeExport] = useState<CircuitProject | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<TranslationKey | null>(initialIssue);
  const [fitOnMount, setFitOnMount] = useState(autoFit);
  const operationError = useCallback(() => setNotice('operationError'), []);
  const simulation = useSimulation(project, `${project.id}-${revision}`);
  const [wiperPreview, setWiperPreview] = useState<{
    componentId: string;
    ratio: number;
    initialRatio: number;
  } | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<readonly string[]>([]);
  useEffect(() => setHighlightedIds([]), [simulation.snapshot]);
  const [libraryDrag, setLibraryDrag] = useState<{ kind: ComponentKind; color?: LedColor } | null>(
    null,
  );
  useEffect(() => setWiperPreview(null), [project.id, project.components, simulation.status]);
  const locked = simulation.status !== 'stopped';
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const editor = useCircuitEditor(project, operationError, locked);
  const { tool, setTool } = editor;
  const selectedComponent = project.components.find(
    (item) => item.id === editor.selection.components.at(-1),
  );
  const selectedWire = project.wires.find((item) => item.id === editor.selection.wire);
  const boardContext = useBoardContext(
    `${project.id}-${revision}`,
    project.components,
    selectedComponent?.id,
  );
  const inspectorVisible = (tools.compact ? tools.mobilePanel === 'inspector' : inspectorOpen)
    && Boolean(selectedComponent || selectedWire);
  const selectionKey = selectedWire
    ? `wire:${selectedWire.id}`
    : selectedComponent
      ? `component:${selectedComponent.id}`
      : null;
  useEffect(() => {
    setInspectorOpen(selectionKey !== null);
    if (!selectionKey) tools.setMobilePanel((previous) => previous === 'inspector' ? null : previous);
  }, [selectionKey]);
  const activeKind = selectedComponent?.kind ?? inspectedKind;
  const inspectedComponent =
    selectedComponent?.kind === 'potentiometer' &&
    wiperPreview?.componentId === selectedComponent.id
      ? {
          ...selectedComponent,
          properties: { ...selectedComponent.properties, ratio: wiperPreview.ratio },
        }
      : selectedComponent;
  const previewWiper = (componentId: string, ratio: number | null) => {
    const component = project.components.find((item) => item.id === componentId);
    if (component?.kind !== 'potentiometer') return;
    if (ratio === null) {
      if (simulation.status === 'running' && wiperPreview?.componentId === componentId)
        simulation.setPotentiometer(componentId, wiperPreview.initialRatio);
      setWiperPreview(null);
      return;
    }
    const initialRatio =
      wiperPreview?.componentId === componentId
        ? wiperPreview.initialRatio
        : (ownInput(simulation.inputs.potentiometers, componentId) ?? component.properties.ratio);
    setWiperPreview({ componentId, ratio, initialRatio });
    if (simulation.status === 'running') simulation.setPotentiometer(componentId, ratio);
  };
  const commitWiper = (componentId: string, ratio: number) => {
    const component = project.components.find((item) => item.id === componentId);
    if (component?.kind !== 'potentiometer') return;
    if (simulation.status === 'running') simulation.setPotentiometer(componentId, ratio);
    else if (simulation.status === 'stopped')
      editor.execute({
        type: 'properties',
        id: componentId,
        update: { kind: 'potentiometer', properties: { ...component.properties, ratio } },
      });
    setWiperPreview(null);
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target))
        setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      setMenuOpen(false);
      setInspectorOpen(false);
      if (window.matchMedia('(max-width: 768px)').matches) tools.setMobilePanel(null);
    };
    document.addEventListener('pointerdown', handler);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', handler);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const toggleLibrary = () => {
    setLibraryOpen((previous) => !previous);
  };
  const closeProjects = () => {
    setProjectsOpen(false);
    requestAnimationFrame(() => (tools.compact
      ? document.querySelector<HTMLButtonElement>('[data-testid="mobile-panel-projects"]')
      : libraryToggleRef.current)?.focus({ preventScroll: true }));
  };
  const focusToolsToggle = () => requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>(tools.compact
      ? `[data-testid="mobile-panel-${toolTab}"]` : '[data-testid="sidebar-toggle"]')?.focus({ preventScroll: true }));
  const addAt = (kind: ComponentKind, center: Point, color?: LedColor) => {
    if (locked) return;
    const definition = componentDefinitions[kind];
    const component = createComponent(
      kind,
      { x: center.x - definition.width / 2, y: center.y - definition.height / 2 },
      undefined,
      color,
    );
    if (editor.execute({ type: 'add', component, snap: true })) {
      editor.selectComponent(component.id);
      setInspectorOpen(true);
      setInspectedKind(kind);
      setTool('select');
      if (tools.compact) tools.setMobilePanel(null);
    }
  };
  const addFromLibrary = (kind: ComponentKind, color?: LedColor) => {
    const stage = stageRef.current;
    if (stage)
      addAt(
        kind,
        screenToWorld({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 }, project.viewport),
        color,
      );
  };
  const selectComponent = (id: string, additive = false) => {
    setHighlightedIds([]);
    editor.selectComponent(id, additive);
    boardContext.onCanvasSelection(id);
    setInspectorOpen(true);
  };
  const selectWire = (id: string) => {
    setHighlightedIds([]);
    editor.selectWire(id);
    setInspectorOpen(true);
  };
  const navigateDiagnostic = (ids: readonly string[]) => {
    const related = project.components.filter((item) => ids.includes(item.id));
    if (!related.length) return;
    editor.clearSelection();
    related.forEach((item, index) => editor.selectComponent(item.id, index > 0));
    setHighlightedIds(related.map((item) => item.id));
    setInspectorOpen(true);
    if (tools.compact) tools.setMobilePanel('inspector');
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = related.map((item) => componentScreenBounds(item, project.viewport));
    const left = Math.min(...bounds.map((rect) => rect.x));
    const right = Math.max(...bounds.map((rect) => rect.x + rect.width));
    const top = Math.min(...bounds.map((rect) => rect.y));
    const bottom = Math.max(...bounds.map((rect) => rect.y + rect.height));
    updateViewport({
      ...project.viewport,
      offset: {
        x: project.viewport.offset.x + stage.clientWidth / 2 - (left + right) / 2,
        y:
          project.viewport.offset.y +
          Math.max(100, stage.clientHeight - toolDockOffset) / 2 -
          (top + bottom) / 2,
      },
    });
  };
  const exportProject = () => {
    setMenuOpen(false);
    try {
      const url = URL.createObjectURL(
        new Blob([serializeProject(project)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mesa-project.json';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('exportSuccess');
    } catch {
      setNotice('exportError');
    }
  };
  const importProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || lockedRef.current) return;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('project-too-large');
      const source = await file.text();
      if (lockedRef.current) return;
      const next = replaceWorkspace(source, { fit: false, serial: false });
      routes.adoptLocal(next);
      setNotice('importSuccess');
    } catch {
      setNotice('importError');
    }
  };
  const replaceWorkspace = (source: string, { fit, serial }: { fit: boolean; serial: boolean }) => {
    // Validate and preserve before touching selection, runtime or the document.
    parseProject(source);
    preserveBeforeExample(localStorage, project);
    simulation.reset();
    setFitOnMount(fit);
    editor.clearSelection();
    setInspectorOpen(false);
    if (tools.compact) tools.setMobilePanel(null);
    setConnectionRequest(null);
    setWiperPreview(null);
    setHighlightedIds([]);
    setTool('select');
    setConsoleOpen(serial);
    setPreviewRequest(undefined);
    return load(source);
  };
  const revealCodePreview = () => {
    setToolTab('code');
    setLibraryOpen(true);
    setPreviewRevealSequence((value) => value + 1);
  };
  const routes = useProjectRoutes({ project, saved, t,
    onHome: () => setProjectsOpen(true),
    install: (next, route) => {
      replaceWorkspace(serializeProject(next), { fit: route.kind === 'example', serial: route.kind === 'example' && route.id === 'dht11' });
      if (route.kind === 'new') setToolTab('components');
      if (route.kind === 'example' && route.id === 'esp-chat-led') revealCodePreview();
      setNotice(route.kind === 'example' ? 'exampleLoaded' : route.kind === 'new' ? 'projectCreated' : 'savedProjectOpened');
    },
  });
  const renderInspector = (components: ElectronicComponent[], wires: Wire[]) =>
    inspectorVisible ? (
      <ContextualInspector
        components={components}
        wires={wires}
        viewport={project.viewport}
        componentId={selectedComponent?.id ?? null}
        wireId={selectedWire?.id ?? null}
        stageRef={stageRef}
        collapsed={tools.inspectorCollapsed}
        onToggleCollapse={() => tools.setInspectorCollapsed(!tools.inspectorCollapsed)}
        onClose={() => {
          setInspectorOpen(false);
          if (tools.compact) {
            tools.setMobilePanel(null);
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="mobile-panel-inspector"]')?.focus({ preventScroll: true }));
          }
        }}
        onSheetDockChange={setInspectorDockOffset}
      >
        {(headerActions, close) =>
          selectedWire ? (
            <WireInspector
              key={selectedWire.id}
              collapsed={tools.inspectorCollapsed}
              headerActions={headerActions}
              locked={locked}
              wire={selectedWire}
              components={project.components}
              execute={editor.execute}
              onClose={close}
              onRemove={editor.remove}
            />
          ) : (
            <Inspector
              key={selectedComponent?.id ?? activeKind}
              collapsed={tools.inspectorCollapsed}
              headerActions={headerActions}
              locked={locked}
              simulation={simulation}
              kind={activeKind}
              {...(inspectedComponent ? { component: inspectedComponent } : {})}
              selectedCount={editor.selection.components.length}
              onClose={close}
              onUpdate={(update) => {
                if (selectedComponent)
                  editor.execute({ type: 'properties', id: selectedComponent.id, update });
              }}
              onRotate={editor.rotate}
              onDuplicate={editor.duplicate}
              onRemove={editor.remove}
              onStartConnection={(reference) => {
                if (locked) return;
                setTool('connect');
                setConnectionRequest(reference);
              }}
            />
          )
        }
      </ContextualInspector>
    ) : null;
  return (
    <div className="app-shell" data-simulation-status={simulation.status} data-mobile-panel={tools.mobilePanel ?? 'desk'}>
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="LosProfesParaVos"
          onClick={(event) => {
            event.preventDefault();
            setHelpOpen(true);
          }}
        >
          <span className="brand-mark">
            <img src="/losprofesparavos-isotype.png" alt="" width={28} height={28} />
          </span>
          <span className="brand-name">
            LosProfesParaVos
            <small>{t('brandSubtitle')}</small>
          </span>
        </a>
        <div className="header-divider" />
        <div className="project-meta">
          <div className="project-title-row">
            <input
              aria-label={t('projectName')}
              value={project.name}
              placeholder={t('projectDefault')}
              maxLength={100}
              onChange={(event) => updateName(event.target.value)}
            />
            <span className="local-badge">{t('localProject')}</span>
          </div>
          <div className={`save-state ${saved ? 'is-saved' : ''}`}>
            <Icon name={saved ? 'check' : 'folder'} size={12} />
            <span>{t(saveStatus === 'error' ? 'saveErrorShort' : saved ? 'saved' : 'saving')}</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="icon-button help-button"
            aria-label={t('help')}
            title={t('help')}
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="help" size={20} />
          </button>
          <span className="header-action-divider" />
          <button
            className="save-button"
            aria-label={t('save')}
            onClick={() => {
              void saveNow().then((success) => setNotice(success ? 'saveSuccess' : 'saveError'));
            }}
          >
            <Icon name="save" size={16} />
            <span>{t('save')}</span>
          </button>
          <div className="file-menu-container" ref={menuRef}>
            <button
              className={`icon-button ${menuOpen ? 'active-subtle' : ''}`}
              aria-label={t('files')}
              aria-expanded={menuOpen}
              aria-controls="file-options"
              onClick={() => setMenuOpen((previous) => !previous)}
            >
              <Icon name="more" />
            </button>
            {menuOpen && (
              <div className="file-menu" id="file-options">
                <button onClick={exportProject}>
                  <Icon name="download" size={16} />
                  {t('export')}
                </button>
                <button data-testid="export-code" disabled={boardContext.boards.length === 0}
                  title={boardContext.boards.length === 0 ? t('codeExportNoBoard') : t('exportCode')}
                  onClick={() => { setCodeExport(project); setMenuOpen(false); }}>
                  <Icon name="download" size={16} />{t('exportCode')}
                </button>
                <button
                  disabled={locked}
                  onClick={() => {
                    fileRef.current?.click();
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="upload" size={16} />
                  {t('import')}
                </button>
                <hr />
                <button
                  disabled={locked}
                  onClick={() => {
                    setResetOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Icon name="undo" size={16} />
                  {t('newProject')}
                </button>
                <p>{t('storageNotice')}</p>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          disabled={locked}
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            void importProject(event);
          }}
          aria-label={t('import')}
        />
      </header>
      <nav className="workspace-nav" aria-label={t('workspace')}>
        <span className="workspace-context">
          <Icon name="chip" size={17} />
          {t('workspace')}
        </span>
        <div className="simulation-actions" data-status={simulation.status}>
          <span
            className="simulation-state"
            data-status={simulation.status}
            role="status"
            data-testid="simulation-status"
          >
            <span />
            {t(statusMessages[simulation.status])}
          </span>
          <span className="simulation-divider" />
          <button
            className="simulation-button"
            data-testid="simulation-start"
            disabled={simulation.status === 'running'}
            onClick={() => {
              setTool('select');
              setConnectionRequest(null);
              setConsoleOpen(true);
              simulation.start();
              const preview = simulationPreview(project);
              if (preview) {
                boardContext.selectBoard(preview.boardId);
                setPreviewRequest((previous) => ({ ...preview, sequence: (previous?.sequence ?? 0) + 1 }));
                revealCodePreview();
              }
              if (simulation.status === 'stopped') {
                for (const board of boardContext.boards) {
                  const program = project.programs.find((item) => item.componentId === board.id);
                  if (!program) continue;
                  const main = sourceFiles(program).find((file) => file.name === 'main.ino');
                  simulation.runFirmware(board.id, main?.source ?? '');
                }
              }
            }}
          >
            <Icon name="play" size={14} />
            {t(simulation.status === 'paused' ? 'resumeSimulation' : 'start')}
          </button>
          <button
            className="icon-button"
            data-testid="simulation-pause"
            disabled={simulation.status !== 'running'}
            aria-label={t('pause')}
            title={t('pause')}
            onClick={simulation.pause}
          >
            <Icon name="pause" size={15} />
          </button>
          <button
            className="icon-button"
            data-testid="simulation-stop"
            disabled={!locked}
            aria-label={t('stop')}
            title={t('stop')}
            onClick={simulation.stop}
          >
            <Icon name="stop" size={14} />
          </button>
          <button
            className="icon-button"
            data-testid="simulation-reset"
            aria-label={t('simulationReset')}
            title={t('simulationReset')}
            onClick={simulation.reset}
          >
            <Icon name="undo" size={15} />
          </button>
        </div>
      </nav>
      <div
        className={`lab-layout ${libraryOpen ? 'library-open' : ''} ${inspectorVisible ? 'inspector-open' : ''}`}
      >
        <main className="workspace-main">
          <div className="editor-toolbar">
            <div className="tool-group">
              <button
                className={`icon-button ${projectsOpen ? 'active-subtle' : ''}`}
                ref={libraryToggleRef}
                data-testid="library-toggle"
                aria-expanded={projectsOpen}
                aria-controls="example-projects"
                onClick={() => setProjectsOpen((previous) => !previous)}
                title={t('toggleProjects')}
                aria-label={t('toggleProjects')}
                aria-pressed={projectsOpen}
              >
                <Icon name="folder" />
              </button>
              <span className="control-divider" />
              {(['select', 'pan', 'connect'] as const).map((item) => (
                <button
                  key={item}
                  className={`icon-button ${tool === item ? 'active' : ''}`}
                  disabled={locked && item === 'connect'}
                  onClick={() => setTool(item)}
                  title={t(item)}
                  aria-label={t(item)}
                  aria-pressed={tool === item}
                >
                  <Icon name={item === 'select' ? 'select' : item === 'pan' ? 'hand' : 'wire'} />
                </button>
              ))}
              <button
                className="icon-button"
                onClick={editor.rotate}
                disabled={locked || !editor.selection.components.length}
                title={t('rotate')}
                aria-label={t('rotate')}
              >
                <Icon name="rotate" />
              </button>
              <button
                className="icon-button"
                onClick={editor.duplicate}
                disabled={locked || !editor.selection.components.length}
                title={t('duplicate')}
                aria-label={t('duplicate')}
              >
                <Icon name="copy" />
              </button>
              <button
                className="icon-button"
                onClick={editor.remove}
                disabled={locked || (!editor.selection.components.length && !editor.selection.wire)}
                title={t('remove')}
                aria-label={t('remove')}
              >
                <Icon name="trash" />
              </button>
              <span className="control-divider" />
              <button
                className="icon-button"
                onClick={editor.undo}
                disabled={locked || !canUndo}
                title={t('undo')}
                aria-label={t('undo')}
              >
                <Icon name="undo" size={17} />
              </button>
              <button
                className="icon-button"
                onClick={editor.redo}
                disabled={locked || !canRedo}
                title={t('redo')}
                aria-label={t('redo')}
              >
                <Icon name="redo" size={17} />
              </button>
              <label className="toolbar-color" title={t('newWireColor')}>
                <input
                  type="color"
                  value={wireColor}
                  onChange={(event) => setWireColor(event.target.value)}
                  aria-label={t('newWireColor')}
                />
              </label>
            </div>
            <div className="tool-group">
              <span className="toolbar-label">{t('workspace')}</span>
              <button
                className={`icon-button ${libraryOpen ? 'active-subtle' : ''}`}
                title={t('toggleRightPanel')}
                aria-label={t('toggleRightPanel')}
                aria-pressed={libraryOpen}
                aria-expanded={libraryOpen}
                aria-controls="workspace-tools"
                data-testid="tools-toggle"
                onClick={toggleLibrary}
              >
                <Icon name="inspector" />
              </button>
            </div>
          </div>
          <div className="workspace-area">
          <ProjectLibrary open={projectsOpen} onClose={closeProjects} canvasRef={stageRef} canvasVersion={`${project.id}-${revision}`} onOpen={(id) => routes.navigate(examplePaths[id])}
            onCreate={() => routes.navigate('/new')} onOpenCopy={(key, name) => routes.navigate(localProjectPath(name, key))}
            copies={projectCopies.copies} copiesError={projectCopies.error} activeName={project.name} />
          <Workspace
            key={`${project.id}-${revision}`}
            {...(!tools.compact ? { inspector: renderInspector } : {})}
            inspectorDockOffset={Math.max(inspectorDockOffset, toolDockOffset)}
            locked={locked}
            simulation={simulation}
            controlActive={wiperPreview !== null}
            wiperPreview={wiperPreview}
            onWiperPreview={previewWiper}
            onWiperCommit={commitWiper}
            libraryDrag={libraryDrag}
            components={project.components}
            wires={project.wires}
            viewport={project.viewport}
            onViewportChange={updateViewport}
            highlightedIds={highlightedIds}
            selectedIds={editor.selection.components}
            selectedWire={editor.selection.wire}
            onSelectComponent={selectComponent}
            onSelectWire={selectWire}
            onClearSelection={editor.clearSelection}
            onAdd={addAt}
            execute={editor.execute}
            stageRef={stageRef}
            tool={tool}
            cancelEpoch={editor.cancelEpoch}
            autoFit={fitOnMount}
            grid={grid}
            onToggleGrid={() => setGrid((previous) => !previous)}
            wireColor={wireColor}
            connectionRequest={connectionRequest}
          />
          </div>
          <SimulationConsole
            open={consoleOpen}
            onToggle={() => setConsoleOpen((previous) => !previous)}
            status={simulation.status}
            locked={locked}
            diagnostics={simulation.snapshot?.diagnostics ?? null}
            firmware={simulation.firmware}
            onClearSerial={simulation.clearSerial}
            initialIssue={initialIssue}
            components={project.components}
            onNavigate={navigateDiagnostic}
          />
        </main>
        <ToolSidebar
          expandSequence={previewRevealSequence}
          canvasRef={stageRef}
          canvasVersion={`${project.id}-${revision}`}
          onDockChange={setToolDockOffset}
          open={libraryOpen}
          onToggle={toggleLibrary}
          tab={toolTab}
          onTab={setToolTab}
          width={tools.widths[toolTab]}
          onWidth={tools.setWidth}
          onClose={() => {
            setLibraryOpen(false);
            focusToolsToggle();
          }}
          panels={{
            components: (
              <ComponentLibrary
                embedded
                locked={locked}
                onDragComponent={setLibraryDrag}
                selectedKind={activeKind}
                selectedColor={
                  selectedComponent?.kind === 'led' ? selectedComponent.properties.color : undefined
                }
                onAdd={addFromLibrary}
                onClose={() => {
                  setLibraryOpen(false);
                  focusToolsToggle();
                }}
              />
            ),
            code: (
              <CodeWorkspace
                previewRequest={previewRequest}
                web={boardContext.activeBoard?.kind === 'esp8266' ? {
                  session: simulation.firmware[boardContext.activeBoard.id]?.session,
                  execution: simulation.firmware[boardContext.activeBoard.id]?.execution ?? null,
                  running: simulation.status === 'running',
                  request: (path) => simulation.requestFirmwareHttp(boardContext.activeBoard?.id ?? '', path, simulation.firmware[boardContext.activeBoard?.id ?? '']?.session),
                } : undefined}
                chat={boardContext.activeBoard?.kind === 'esp8266' ? {
                  status: simulation.status,
                  telegram: simulation.firmware[boardContext.activeBoard.id]?.execution?.telegram ?? null,
                  send: (chatId, text) => simulation.sendFirmwareChat(boardContext.activeBoard?.id ?? '', chatId, text),
                } : undefined}
                onRevealPreview={revealCodePreview}
                boards={boardContext.boards}
                activeBoard={boardContext.activeBoard}
                program={project.programs.find(
                  (program) => program.componentId === boardContext.activeBoard?.id,
                )}
                saveStatus={saveStatus}
                {...(!tools.compact ? { onClose: () => {
                  setLibraryOpen(false);
                  focusToolsToggle();
                } } : {})}
                onSelectBoard={boardContext.selectBoard}
                onFileAction={(action) =>
                  boardContext.activeBoard
                    ? editor.execute({
                        type: 'program-file',
                        id: boardContext.activeBoard.id,
                        action,
                      })
                    : false
                }
                onChange={(source) => {
                  if (boardContext.activeBoard)
                    editor.execute({ type: 'program', id: boardContext.activeBoard.id, source });
                }}
              />
            ),

          }}
        />
        {tools.compact && renderInspector(project.components, project.wires)}
      </div>
      <MobileWorkspaceNav active={tools.mobilePanel} hasSelection={Boolean(selectionKey)}
        onSelect={(panel) => {
          if (panel === 'components' || panel === 'code') setToolTab(panel);
          else tools.setMobilePanel(panel);
        }} />
      {routes.error && <div className="route-error" role="alert" data-testid="route-error">
        <span>{t(routes.error)}</span><a href="/" onClick={(event) => { event.preventDefault(); routes.navigate('/'); }}>{t('routeHome')}</a>
      </div>}
      <footer className="app-footer">
        <span className="privacy-note">
          <span className="privacy-dot" />
          <Icon name="lock" size={11} />
          {t('localOnly')}
        </span>
        <span className="footer-version">
          {t('previewVersion')}
        </span>
        <label className="locale-picker">
          <Icon name="globe" size={13} />
          <select
            value={locale}
            aria-label={t('language')}
            onChange={(event) => setLocale(event.target.value === 'en' ? 'en' : 'es')}
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <Icon name="down" size={11} />
        </label>
      </footer>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && (
          <div className="toast">
            <Icon name={notice.endsWith('Error') ? 'info' : 'check'} size={18} />
            <span>{t(notice)}</span>
            <button className="icon-button" onClick={() => setNotice(null)} aria-label={t('close')}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {codeExport && <CodeExportDialog project={codeExport} initialBoardId={boardContext.activeBoard?.id}
        onClose={() => setCodeExport(null)} onDownloaded={() => { setCodeExport(null); setNotice('codeExportSuccess'); }} />}
      {routes.pending && <Dialog title={t('replaceExampleTitle')} onClose={routes.cancel} className="reset-dialog">
        <p className="dialog-intro">{t(routes.pending.kind === 'example' ? 'replaceExampleDetail' : 'replaceProjectDetail')}</p>
        <div className="dialog-actions">
          <button className="secondary-button" onClick={routes.cancel}>{t('cancel')}</button>
          <button className="primary-button" data-testid={routes.pending.kind === 'example' ? 'confirm-example' : 'confirm-project'} onClick={routes.confirm}>
            {t(routes.pending.kind === 'example' ? 'openExample' : routes.pending.kind === 'new' ? 'createProject' : 'openSavedProject')}
          </button>
        </div>
      </Dialog>}
      {resetOpen && (
        <Dialog
          title={t('resetTitle')}
          onClose={() => setResetOpen(false)}
          className="reset-dialog"
        >
          <p className="dialog-intro">{t('resetDetail')}</p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setResetOpen(false)}>
              {t('cancel')}
            </button>
            <button
              className="primary-button"
              disabled={locked}
              onClick={() => {
                if (locked) return;
                try {
                  preserveBeforeExample(localStorage, project);
                  const next = reset();
                  routes.adoptLocal(next);
                  setFitOnMount(true);
                  editor.clearSelection();
                  setConnectionRequest(null);
                  setResetOpen(false);
                } catch { setNotice('projectSwitchError'); }
              }}
            >
              {t('reset')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
