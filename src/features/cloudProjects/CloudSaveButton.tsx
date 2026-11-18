import { useEffect, useRef, useState } from 'react';
import type { CircuitProject } from '../../model/types';
import { Dialog } from '../../shared/Dialog';
import { useLocale } from '../../locales/useLocale';
import { useAppSelector } from '../../app/hooks';
import { useCreateProjectMutation } from '../../services/api/projectsApi';
import { apiErrorMessage } from '../../services/api/errors';
import { CloudDocumentError, prepareCloudProject } from './document';
import { useSessionGuard } from '../auth/useSessionGuard';

function SaveDialog({ project, onClose }: { project: CircuitProject; onClose: () => void }) {
  const { t } = useLocale();
  const [name, setName] = useState(project.name);
  const [create, result] = useCreateProjectMutation();
  const [error, setError] = useState<unknown>(null);
  const operation = useRef<{ reset: () => void } | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const currentSession = useSessionGuard();
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; operation.current?.reset(); };
  }, []);
  let validation: CloudDocumentError | null = null;
  try { prepareCloudProject(project, name); }
  catch (failure: unknown) { validation = failure instanceof CloudDocumentError ? failure : new CloudDocumentError('invalid-document'); }
  const submit = async () => {
    if (busy.current || result.isSuccess || !currentSession()) return;
    setError(null);
    try {
      const request = prepareCloudProject(project, name);
      busy.current = true;
      const pending = create(request); operation.current = pending;
      await pending.unwrap();
    } catch (failure: unknown) { if (alive.current && currentSession()) setError(failure); }
    finally { busy.current = false; }
  };
  return <Dialog title={t('cloudSave')} onClose={onClose} className="account-dialog">
    <p>{t('cloudPrivacy')}</p>
    <form className="account-form" aria-busy={result.isLoading} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>{t('cloudName')}<input required maxLength={120} value={name} disabled={result.isLoading || result.isSuccess}
        onChange={event => setName(event.target.value)} /></label>
      <p>{t('cloudLimitNote')}</p>
      {validation?.code === 'project-too-large' && <p role="alert">{t('cloudTooLarge')}</p>}
      {validation?.code === 'invalid-document' && name.trim() && <p role="alert">{t('cloudInvalidDocument')}</p>}
      {error !== null && <p role="alert">{t(error instanceof CloudDocumentError ? apiErrorMessage({ error: error.code }) : apiErrorMessage(error))}</p>}
      {result.isSuccess && <p role="status">{t('cloudSaved')}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('close')}</button>
        <button type="submit" className="primary-button" disabled={!!validation || result.isLoading || result.isSuccess}>{t(result.isLoading ? 'apiLoading' : 'cloudSave')}</button></div>
    </form>
  </Dialog>;
}
export function CloudSaveButton({ project }: { project: CircuitProject }) {
  const { t } = useLocale();
  const { user, epoch } = useAppSelector(state => state.auth);
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [epoch]);
  if (!user) return null;
  return <>
    <button className="text-button cloud-save-button" onClick={() => setOpen(true)}>{t('cloudSave')}</button>
    {open && <SaveDialog key={epoch} project={project} onClose={() => setOpen(false)} />}
  </>;
}
