import { useState } from 'react';
import { useLocale } from '../../locales/useLocale';
import type { TranslationKey } from '../../locales/es/messages';
import { useAppSelector } from '../../app/hooks';
import { Dialog } from '../../shared/Dialog';
import { useGetProjectsQuery, useLazyGetProjectQuery } from '../../services/api/projectsApi';
import { apiErrorMessage } from '../../services/api/errors';
import { CloudDocumentError, readCloudProject } from './document';
import { serializeProject } from '../../model/project';
import { useSessionGuard } from '../auth/useSessionGuard';
import { TasksPanel } from '../tasks/TasksPanel';

function SignedInProjects({ onOpen, locked }: { onOpen: (source: string) => void; locked: boolean }) {
  const { t } = useLocale();
  const projects = useGetProjectsQuery();
  const [fetchProject, remote] = useLazyGetProjectQuery();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const currentSession = useSessionGuard();
  const open = () => {
    if (!currentSession() || locked || !pending || remote.currentData?.id !== pending) return;
    try {
      const document = readCloudProject(remote.currentData);
      onOpen(serializeProject(document));
      setPending(null); setError(null);
    } catch (failure: unknown) { setError(failure instanceof CloudDocumentError ? 'cloudInvalidDocument' : 'cloudOpenError'); }
  };
  return <>
    <button className="text-button" disabled={projects.isFetching} onClick={() => { if (currentSession()) void projects.refetch(); }}>{t('cloudRefresh')}</button>
    {projects.isFetching && <p role="status">{t('apiLoading')}</p>}
    {projects.isError && <p role="alert">{t(apiErrorMessage(projects.error))}</p>}
    {projects.data?.length === 0 && <p>{t('cloudEmpty')}</p>}
    <ul className="cloud-project-list">{projects.data?.map(project => <li key={project.id}>
      <strong>{project.name}</strong>
      <button className="text-button" disabled={locked || remote.isFetching} onClick={() => {
        if (!currentSession()) return;
        setPending(project.id); setError(null);
        void fetchProject(project.id, false);
      }}>{t('cloudOpen')}</button>
    </li>)}</ul>
    <p>{t('cloudLimitNote')}</p>
    <TasksPanel />
    {pending && <Dialog title={t('cloudOpen')} onClose={() => { setPending(null); remote.reset(); }} className="account-dialog">
      <p>{t('cloudOpenNotice')}</p>
      {remote.isFetching && <p role="status">{t('apiLoading')}</p>}
      {remote.isError && <p role="alert">{t(apiErrorMessage(remote.error))}</p>}
      {error !== null && <p role="alert">{t(error)}</p>}
      <div className="dialog-actions"><button className="secondary-button" onClick={() => { setPending(null); remote.reset(); }}>{t('cancel')}</button>
        <button className="primary-button" disabled={locked || remote.isFetching || remote.isError || remote.currentData?.id !== pending} onClick={open}>{t('cloudOpen')}</button></div>
    </Dialog>}
  </>;
}
export function CloudProjectsPanel({ onOpen, locked }: { onOpen: (source: string) => void; locked: boolean }) {
  const { t } = useLocale();
  const { user, epoch } = useAppSelector(state => state.auth);
  return <section className="cloud-projects" data-testid="cloud-projects" aria-labelledby="cloud-projects-title">
    <h3 id="cloud-projects-title">{t('cloudTitle')}</h3>
    {user ? <SignedInProjects key={`${user.id}-${epoch}`} onOpen={onOpen} locked={locked} /> : <p>{t('cloudSignIn')}</p>}
  </section>;
}
