import { useState } from 'react';
import type { RefObject } from 'react';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { WorkspaceSidebar } from '../tools/WorkspaceSidebar';
import { availableExampleCategories, exampleCategoryLabels, projectExamples } from '../../model/exampleProjects';
import type { ExampleId } from '../../model/exampleProjects';
import { catalog } from '../components/catalog';

export function ProjectLibrary({ open, onClose, canvasRef, canvasVersion, onOpen }: {
  open: boolean; onClose: () => void; canvasRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: ExampleId) => void;
  canvasVersion: string;
}) {
  const { t } = useLocale();
  const [width, setWidth] = useState(280);
  return <WorkspaceSidebar side="left" id="example-projects" testId="project-library" controlPrefix="projects"
    open={open} onClose={onClose} width={width} onWidth={setWidth} canvasRef={canvasRef} canvasVersion={canvasVersion}
    label={t('exampleProjects')} resizeLabel={t('resizeProjects')}
    header={<>
      <h2 className="project-library-title"><Icon name="folder" size={17} />{t('projects')}</h2>
      <button className="icon-button" onClick={onClose} aria-label={t('close')}><Icon name="close" size={16} /></button>
    </>}>
    <div className="tool-sidebar-content project-library-content">
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
