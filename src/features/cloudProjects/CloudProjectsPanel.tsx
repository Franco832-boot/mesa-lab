import { useState } from 'react';
import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import { useAppSelector } from '../../app/hooks';
import { Dialog } from '../../shared/Dialog';
import { Icon } from '../../shared/Icon';
import { useGetProjectsQuery, useLazyGetProjectQuery } from '../../services/api/projectsApi';
import { apiErrorCode, apiErrorMessage } from '../../services/api/errors';
import { CloudDocumentError, readCloudProject } from './document';
import { serializeProject } from '../../model/project';
import { useSessionGuard } from '../auth/useSessionGuard';
import type { ProjectResponse } from '../../services/api/contracts';

type OpenProject = (source: string, remote: ProjectResponse) => void;
function ErrorText({ error }: { error: unknown }) {
  const { t } = useLocale();
  const code = apiErrorCode(error);
  return <span>{t(apiErrorMessage(error))}{code && <> <small>({code})</small></>}</span>;
}

function SignedInProjects({ onOpen, locked }: { onOpen: OpenProject; locked: boolean }) {
  const { t, locale } = useLocale();
  const projects = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true });
  const [fetchProject, remote] = useLazyGetProjectQuery();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const currentSession = useSessionGuard();
  const dateFormat = new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const open = () => {
    if (!currentSession() || locked || !pending || remote.currentData?.id !== pending) return;
    try {
      const document = { ...readCloudProject(remote.currentData), id: remote.currentData.id, name: remote.currentData.name };
      onOpen(serializeProject(document), remote.currentData);
      setPending(null); setError(null);
    } catch (failure: unknown) { setError(failure instanceof CloudDocumentError ? 'cloudInvalidDocument' : 'cloudOpenError'); }
  };
  return <>
    <div className="cloud-project-toolbar">
      <span>{t('cloudAccountProjects')}</span>
      <button className="cloud-refresh" aria-label={t('cloudRefresh')} disabled={projects.isFetching}
        onClick={() => { if (currentSession()) void projects.refetch(); }}>
        <Icon name="rotate" size={14} /><span>{t('cloudRefreshShort')}</span>
      </button>
    </div>
    {projects.isFetching && <p className="cloud-feedback" role="status">{t('apiLoading')}</p>}
    {projects.isFetching && !projects.data && <div className="cloud-skeleton" aria-hidden="true"><span /><span /><span /></div>}
    {projects.isError && <p className="cloud-feedback is-error" role="alert"><Icon name="info" size={18} /><ErrorText error={projects.error} /></p>}
    {!projects.isFetching && !projects.isError && projects.data?.length === 0 && <p className="cloud-feedback is-empty"><Icon name="folder" size={22} />{t('cloudEmpty')}</p>}
    <ul className="cloud-project-list" aria-busy={projects.isFetching}>{projects.data?.map(project => <li key={project.id} className="cloud-project-card">
      <div className="cloud-project-card-heading"><span className="cloud-project-icon"><Icon name="folder" size={18} /></span><strong>{project.name}</strong></div>
      <p className="cloud-project-date"><span>{t('cloudModified')}</span><time dateTime={project.updatedAt}>{dateFormat.format(new Date(project.updatedAt))}</time></p>
      <button className="cloud-open-button" disabled={locked || remote.isFetching} onClick={() => {
        if (!currentSession()) return;
        setPending(project.id); setError(null);
        void fetchProject(project.id, false);
      }}>{t('cloudOpen')}<Icon name="arrow" size={15} /></button>
    </li>)}</ul>
    <p className="cloud-local-note"><Icon name="info" size={15} />{t('cloudLocalNotice')}</p>
    {pending && <Dialog title={t('cloudOpen')} onClose={() => { setPending(null); remote.reset(); }} className="account-dialog">
      <p>{t('cloudOpenNotice')}</p>
      {remote.isFetching && <p role="status">{t('apiLoading')}</p>}
      {remote.isError && <p role="alert"><ErrorText error={remote.error} /></p>}
      {error !== null && <p role="alert">{t(error)}</p>}
      <div className="dialog-actions"><button className="secondary-button" onClick={() => { setPending(null); remote.reset(); }}>{t('cancel')}</button>
        <button className="primary-button" disabled={locked || remote.isFetching || remote.isError || remote.currentData?.id !== pending} onClick={open}>{t('cloudOpen')}</button></div>
    </Dialog>}
  </>;
}
export function CloudProjectsPanel({ onOpen, locked }: { onOpen: OpenProject; locked: boolean }) {
  const { t } = useLocale();
  const { user, epoch } = useAppSelector(state => state.auth);
  return <section className="cloud-projects" data-testid="cloud-projects" aria-labelledby="cloud-projects-title">
    <div className="cloud-projects-heading"><Icon name="folder" size={19} /><h3 id="cloud-projects-title">{t('cloudTitle')}</h3></div>
    {user ? <SignedInProjects key={`${user.id}-${epoch}`} onOpen={onOpen} locked={locked} /> : <p className="cloud-feedback">{t('cloudSignIn')}</p>}
  </section>;
}
