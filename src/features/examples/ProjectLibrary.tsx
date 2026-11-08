import { useState } from 'react';
import type { RefObject } from 'react';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { WorkspaceSidebar } from '../tools/WorkspaceSidebar';
import { availableExampleCategories, exampleCategoryLabels, projectExamples } from '../../model/exampleProjects';
import type { ExampleId } from '../../model/exampleProjects';
import { catalog } from '../components/catalog';
import { ContactCard } from '../contact/ContactCard';
import type { ProjectCopy } from './replacement';

export function ProjectLibrary({ open, onClose, canvasRef, canvasVersion, onOpen, onCreate, onOpenCopy, copies, copiesError, activeName }: {
  open: boolean; onClose: () => void; canvasRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: ExampleId) => void;
  canvasVersion: string;
  onCreate: () => void;
  onOpenCopy: (key: string) => void;
  copies: readonly ProjectCopy[];
  copiesError: boolean;
  activeName: string;
}) {
  const { t } = useLocale();
  const [width, setWidth] = useState(280);
  return <WorkspaceSidebar side="left" id="example-projects" testId="project-library" controlPrefix="projects"
    open={open} onClose={onClose} width={width} onWidth={setWidth} canvasRef={canvasRef} canvasVersion={canvasVersion}
    label={t('projects')} resizeLabel={t('resizeProjects')}
    header={<>
      <h2 className="project-library-title"><Icon name="folder" size={17} />{t('projects')}</h2>
      <button className="icon-button" onClick={onClose} aria-label={t('close')}><Icon name="close" size={16} /></button>
    </>}>
    <div className="tool-sidebar-content project-library-content">
      <article className="project-card project-start-card" data-testid="create-project-card" aria-labelledby="create-project-title">
        <h3 id="create-project-title">{t('createNewProjectTitle')}</h3>
        <p>{t('createNewProjectDescription')}</p>
        <button className="secondary-button" data-testid="create-project" onClick={onCreate}><Icon name="plus" size={14} />{t('createProject')}</button>
        <details className="saved-projects" data-testid="saved-projects">
          <summary>{t('savedProjects')} ({copies.length + 1})</summary>
          <ul>
            <li className="saved-project-current"><strong>{activeName || t('untitledProject')}</strong><small>{t('currentProject')}</small></li>
            {copies.map((copy, index) => <li key={copy.key}>
              <button type="button" className="text-button" data-testid="open-project-copy" data-copy-key={copy.key}
                aria-label={`${t('openSavedProject')}: ${copy.name || t('untitledProject')} · ${t('projectCopy')} ${index + 1}`}
                onClick={() => onOpenCopy(copy.key)}>
                <span>{copy.name || t('untitledProject')}</span><small>{t('projectCopy')} {index + 1}</small>
              </button>
            </li>)}
          </ul>
          <p>{t('projectCopiesNote')}</p>
        </details>
        {copiesError && <p role="alert">{t('projectCopiesError')}</p>}
      </article>
      <ContactCard kind="project" />
      <p className="project-library-intro">{t('exampleProjectsIntro')}</p>
      {availableExampleCategories.map((category) => <section key={category} aria-labelledby={`examples-${category}`}>
        <h3 id={`examples-${category}`} className="project-category">{t(exampleCategoryLabels[category])}</h3>
        {projectExamples.filter((example) => example.category === category).map((example) => <article
          key={example.id} className="project-card" data-testid={`example-${example.id}`} aria-labelledby={`example-title-${example.id}`}>
          <h4 id={`example-title-${example.id}`}>{t(example.name)}</h4>
          <p>{t(example.description)}</p>
          <span className="project-card-components">{example.components.map((kind) => {
            const entry = catalog.find((item) => item.kind === kind);
            return entry ? t(entry.name) : kind;
          }).join(' · ')}</span>
          <button className="secondary-button" onClick={() => onOpen(example.id)} aria-label={`${t('openExample')}: ${t(example.name)}`}>
            <Icon name="folder" size={14} />{t('openExample')}
          </button>
        </article>)}
      </section>)}
      <p className="project-library-intro">{t('exampleBackupNote')}</p>
    </div>
  </WorkspaceSidebar>;
}
