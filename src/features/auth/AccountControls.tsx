import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useLocale } from '../../locales/useLocale';
import { Dialog } from '../../shared/Dialog';
import { useMeQuery } from '../../services/api/authApi';
import { apiErrorMessage } from '../../services/api/errors';
import { submitAuthentication } from './authenticate';
import type { AuthMode } from './authenticate';
import { sessionEnded } from './authSlice';

function AuthForm({ mode, onClose }: { mode: AuthMode; onClose: () => void }) {
  const { t } = useLocale();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const operation = useRef<{ abort: () => void; reset: () => void } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; operation.current?.abort(); operation.current?.reset(); };
  }, []);
  const title = t(mode === 'login' ? 'authLogin' : 'authRegister');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operation.current) return;
    setPending(true); setError(null);
    const request = dispatch(submitAuthentication(mode, { email, password }));
    operation.current = request;
    setPassword('');
    try { await request.unwrap(); if (alive.current) onClose(); }
    catch (failure: unknown) { if (alive.current) setError(failure); }
    finally {
      request.reset(); operation.current = null;
      if (alive.current) setPending(false);
    }
  };
  return <Dialog title={title} onClose={onClose} className="account-dialog">
    <p>{t('authMemoryNotice')}</p>
    <form className="account-form" aria-busy={pending} onSubmit={event => { void submit(event); }}>
      <label>{t('authEmail')}<input name="email" type="email" autoComplete="email" required maxLength={254}
        value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></label>
      <label>{t('authPassword')}<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        aria-describedby="auth-password-hint"
        required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></label>
      <small id="auth-password-hint">{t('authPasswordHint')}</small>
      {error !== null && <p role="alert">{t(typeof error === 'object' && error !== null && 'status' in error && error.status === 401
        ? 'authInvalidCredentials' : apiErrorMessage(error))}</p>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>{t('cancel')}</button>
        <button className="primary-button" type="submit" disabled={pending}>{t(pending ? 'apiLoading' : mode === 'login' ? 'authLogin' : 'authRegister')}</button>
      </div>
    </form>
  </Dialog>;
}
export function AccountControls() {
  const { t } = useLocale();
  const dispatch = useAppDispatch();
  const { user, reason } = useAppSelector(state => state.auth);
  const [mode, setMode] = useState<AuthMode | null>(null);
  const me = useMeQuery(undefined, { skip: user === null });
  return <div className="account-controls" data-testid="account-controls">
    {user ? <>
      <span className="account-email" title={user.email}>{user.email}</span>
      <button className="text-button" onClick={() => dispatch(sessionEnded('signed-out'))}>{t('authLogout')}</button>
      {me.isError && <span role="status">{t(apiErrorMessage(me.error))}</span>}
    </> : <>
      <button className="text-button" onClick={() => setMode('login')}>{t('authLogin')}</button>
      <button className="secondary-button" onClick={() => setMode('register')}>{t('authRegister')}</button>
      {reason === 'expired' && <span className="account-session-status" role="status">{t('authExpired')}</span>}
    </>}
    {mode && <AuthForm key={mode} mode={mode} onClose={() => setMode(null)} />}
  </div>;
}
