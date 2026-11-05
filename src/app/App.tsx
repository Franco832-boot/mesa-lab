import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useLocale } from '../locales/useLocale';
import type { TranslationKey } from '../locales/es/messages';
import { Icon } from '../shared/Icon';
import { Dialog } from '../shared/Dialog';
import type { ComponentKind, ElectronicComponent, PinReference, Point, Wire } from '../model/types';
import { componentDefinitions, createComponent } from '../model/components';
import type { LedColor } from '../model/components';
import { screenToWorld } from '../model/coordinates';
import { useCircuitEditor } from '../features/project/useCircuitEditor';
import { WireInspector } from '../features/components/WireInspector';
import { MAX_PROJECT_BYTES, serializeProject } from '../model/project';
import { useProject } from '../features/project/useProject';
import { ComponentLibrary } from '../features/components/ComponentLibrary';
import { Inspector } from '../features/components/Inspector';
import { ContextualInspector } from '../features/components/ContextualInspector';
import { ToolSidebar } from '../features/tools/ToolSidebar';
import { useWorkspaceTools } from '../features/tools/useWorkspaceTools';
import { useBoardContext } from '../features/tools/useBoardContext';
import { CodeWorkspace } from '../features/tools/CodeWorkspace';
import { IotWorkspace } from '../features/tools/IotWorkspace';
import { Workspace } from '../features/workspace/Workspace';
import { useSimulation } from '../features/simulation/useSimulation';
import { ownInput } from '../sim/topology';
import { statusMessages } from '../features/simulation/messages';

import { DiagnosticsPanel } from '../features/simulation/DiagnosticsPanel';
import { groupDiagnostics } from '../features/simulation/diagnostics';
import { componentScreenBounds } from '../features/components/inspectorPlacement';

const roadmapKeys = [
  'roadmap1',
  'roadmap2',
  'roadmap3',
  'roadmap4',
  'roadmap5',
  'roadmap6',
] as const;
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
  const tools = useWorkspaceTools();
  const libraryOpen = tools.open;
  const setLibraryOpen = tools.setOpen;
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
  const inspectorVisible = inspectorOpen && Boolean(selectedComponent || selectedWire);
  const selectionKey = selectedWire
    ? `wire:${selectedWire.id}`
    : selectedComponent
      ? `component:${selectedComponent.id}`
      : null;
  useEffect(() => {
    setInspectorOpen(selectionKey !== null);
    if (selectionKey && window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
  }, [selectionKey]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const reconcilePanels = () => {
      if (media.matches && inspectorVisible) setLibraryOpen(false);
    };
    reconcilePanels();
    media.addEventListener('change', reconcilePanels);
    return () => media.removeEventListener('change', reconcilePanels);
  }, [inspectorVisible]);
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
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setInspectorOpen(false);
      if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
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
    if (window.matchMedia('(max-width: 760px)').matches) setInspectorOpen(false);
  };
  const toggleInspector = () => {
    if (!selectedComponent && !selectedWire) return;
    setInspectorOpen((previous) => !previous);
    if (!inspectorVisible)
      requestAnimationFrame(() =>
        document.getElementById('context-inspector')?.focus({ preventScroll: true }),
      );
    if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
  };
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
      if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
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
    if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
  };
  const selectWire = (id: string) => {
    setHighlightedIds([]);
    editor.selectWire(id);
    setInspectorOpen(true);
    if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
  };
  const navigateDiagnostic = (ids: readonly string[]) => {
    const related = project.components.filter((item) => ids.includes(item.id));
    if (!related.length) return;
    editor.clearSelection();
    related.forEach((item, index) => editor.selectComponent(item.id, index > 0));
    setHighlightedIds(related.map((item) => item.id));
    setInspectorOpen(true);
    if (window.matchMedia('(max-width: 760px)').matches) setLibraryOpen(false);
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
      load(source);
      setFitOnMount(false);
      editor.clearSelection();
      setConnectionRequest(null);
      setNotice('importSuccess');
    } catch {
      setNotice('importError');
    }
  };
  const renderInspector = (components: ElectronicComponent[], wires: Wire[]) =>
    inspectorVisible ? (
      <ContextualInspector
        components={components}
        wires={wires}
        viewport={project.viewport}
        componentId={selectedComponent?.id ?? null}
        wireId={selectedWire?.id ?? null}
        stageRef={stageRef}
        onClose={() => setInspectorOpen(false)}
        onSheetDockChange={setInspectorDockOffset}
      >
        {(headerActions, close) =>
          selectedWire ? (
            <WireInspector
              key={selectedWire.id}
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
              headerActions={headerActions}
              locked={locked}
              simulation={simulation}
              kind={activeKind}
              {...(inspectedComponent ? { component: inspectedComponent } : {})}
              selectedCount={editor.selection.components.length}
              onClose={close}
              onRoadmap={() => setHelpOpen(true)}
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
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="Mesa Circuit Lab"
          onClick={(event) => {
            event.preventDefault();
            setHelpOpen(true);
          }}
        >
          <span className="brand-mark">
            <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <path
                d="M5 21V8l9 6 9-6v13m-9-7v7"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="5" cy="6" r="1.5" fill="currentColor" />
              <circle cx="23" cy="6" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">
            mesa<span className="brand-dot">.</span>
            <small>CIRCUIT LAB</small>
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
          <span className="phase-badge">
            <span />
            {t('phase')}
            <span className="phase-description">{t('foundations')}</span>
          </span>
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
                className={`icon-button ${libraryOpen ? 'active-subtle' : ''}`}
                ref={libraryToggleRef}
                data-testid="library-toggle"
                aria-expanded={libraryOpen}
                aria-controls="workspace-tools"
                onClick={toggleLibrary}
                title={t('toggleTools')}
                aria-label={t('toggleTools')}
                aria-pressed={libraryOpen}
              >
                <Icon name="library" />
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
                className={`icon-button ${editor.multiSelect ? 'active-subtle' : ''}`}
                onClick={() => editor.setMultiSelect((value) => !value)}
                aria-label={t('multiSelect')}
                title={t('multiSelect')}
                aria-pressed={editor.multiSelect}
              >
                <Icon name="plus" />
              </button>
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
                className={`icon-button ${inspectorVisible ? 'active-subtle' : ''}`}
                title={t('showProperties')}
                aria-label={t('showProperties')}
                aria-pressed={inspectorVisible}
                aria-expanded={inspectorVisible}
                aria-controls="context-inspector"
                disabled={!selectedComponent && !selectedWire}
                data-testid="inspector-toggle"
                onClick={toggleInspector}
              >
                <Icon name="inspector" />
              </button>
            </div>
          </div>
          <Workspace
            key={`${project.id}-${revision}`}
            inspector={renderInspector}
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
            multiSelect={editor.multiSelect}
            cancelEpoch={editor.cancelEpoch}
            autoFit={fitOnMount}
            grid={grid}
            onToggleGrid={() => setGrid((previous) => !previous)}
            wireColor={wireColor}
            connectionRequest={connectionRequest}
          />
          <div className={`console-panel ${consoleOpen ? 'open' : ''}`}>
            <button
              className="console-toggle"
              onClick={() => setConsoleOpen((previous) => !previous)}
              aria-expanded={consoleOpen}
              aria-controls="console-messages"
            >
              <span>
                <Icon name="terminal" size={15} />
                {t('console')}
                <span className="console-count">
                  {groupDiagnostics(simulation.snapshot?.diagnostics ?? []).length}
                </span>
              </span>
              <span className="console-right">
                {t(statusMessages[simulation.status])}
                <Icon name={consoleOpen ? 'down' : 'chevron'} size={14} />
              </span>
            </button>
            {consoleOpen && (
              <div id="console-messages" className="console-message">
                <div
                  className="simulation-diagnostics"
                  data-testid="simulation-diagnostics"
                  aria-live="polite"
                >
                  <p>{t(locked ? 'simulationLocked' : 'simulationReady')}</p>
                  {initialIssue && <p>{t(initialIssue)}</p>}
                  {simulation.snapshot && (
                    <DiagnosticsPanel
                      diagnostics={simulation.snapshot.diagnostics}
                      components={project.components}
                      onNavigate={navigateDiagnostic}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
        <ToolSidebar
          canvasRef={stageRef}
          onDockChange={setToolDockOffset}
          open={libraryOpen}
          tab={toolTab}
          onTab={(tab) => {
            setToolTab(tab);
            if (tab === 'code' && window.matchMedia('(max-width: 760px)').matches)
              setLibraryOpen(false);
          }}
          width={tools.widths[toolTab]}
          onWidth={tools.setWidth}
          onClose={() => {
            setLibraryOpen(false);
            requestAnimationFrame(() => libraryToggleRef.current?.focus({ preventScroll: true }));
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
                  requestAnimationFrame(() =>
                    libraryToggleRef.current?.focus({ preventScroll: true }),
                  );
                }}
              />
            ),
            code: (
              <CodeWorkspace
                boards={boardContext.boards}
                activeBoard={boardContext.activeBoard}
                program={project.programs.find(
                  (program) => program.componentId === boardContext.activeBoard?.id,
                )}
                saveStatus={saveStatus}
                onClose={() => {
                  setToolTab('components');
                  requestAnimationFrame(() => libraryToggleRef.current?.focus());
                }}
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
            iot: (
              <IotWorkspace
                key={`${project.id}-${revision}`}
                boards={boardContext.boards}
                activeBoard={boardContext.activeBoard}
                onSelectBoard={boardContext.selectBoard}
                simulation={simulation}
                onConfig={(id, config) => editor.execute({ type: 'network', id, config })}
              />
            ),
          }}
        />
      </div>
      <footer className="app-footer">
        <span className="privacy-note">
          <span className="privacy-dot" />
          <Icon name="lock" size={11} />
          {t('localOnly')}
        </span>
        <span className="footer-version">
          {t('previewVersion')}
          <span>·</span>
          <button onClick={() => setHelpOpen(true)}>
            {t('roadmap')}
            <Icon name="arrow" size={12} />
          </button>
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
      {helpOpen && (
        <Dialog title={t('helpTitle')} onClose={() => setHelpOpen(false)}>
          <p className="dialog-intro">{t('helpIntro')}</p>
          <div className="help-gestures">
            <Icon name="hand" />
            <div>
              <h3>{t('helpGestures')}</h3>
              <p>{t('helpGestureDetail')}</p>
            </div>
          </div>
          <ol className="roadmap-list">
            {roadmapKeys.map((key, i) => (
              <li key={key} className={i === 3 ? 'current' : ''}>
                <span className="roadmap-number">0{i + 1}</span>
                <p>{t(key)}</p>
                {i === 3 && <span className="small-tag">{t('current')}</span>}
              </li>
            ))}
          </ol>
          <button className="primary-button dialog-done" onClick={() => setHelpOpen(false)}>
            {t('done')}
            <Icon name="check" size={16} />
          </button>
        </Dialog>
      )}
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
                reset();
                setFitOnMount(true);
                editor.clearSelection();
                setConnectionRequest(null);
                setResetOpen(false);
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