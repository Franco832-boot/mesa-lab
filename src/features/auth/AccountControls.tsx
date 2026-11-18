import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { useLocale } from '../../locales/useLocale';
import { Dialog } from '../../shared/Dialog';
import { Icon } from '../../shared/Icon';
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
        ? 'authInvalidCredentials' : typeof error === 'object' && error !== null && 'status' in error && error.status === 409
          ? 'authEmailConflict' : apiErrorMessage(error))}</p>}
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
  const [menuOpen, setMenuOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const me = useMeQuery(undefined, { skip: user === null });
  useEffect(() => { setMenuOpen(false); }, [user?.id, reason]);
  useEffect(() => {
    if (!menuOpen) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [menuOpen]);
  const closeMenu = () => { setMenuOpen(false); trigger.current?.focus(); };
  const menuKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(); return; }
    if (event.key === 'Tab') { setMenuOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const index = items.findIndex(item => item === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  };
  const openForm = (next: AuthMode) => { setMenuOpen(false); setMode(next); };
  return <div className="account-controls" data-testid="account-controls" ref={container}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
    }}>
    <button ref={trigger} type="button" className="account-trigger" id="account-trigger"
      aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'account-options' : undefined}
      onClick={() => setMenuOpen(previous => !previous)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setMenuOpen(true); }
      }}>
      <span className="account-avatar" aria-hidden="true">{user ? user.email.slice(0, 1).toUpperCase() : <Icon name="lock" size={15} />}</span>
      <span>{t(user ? 'accountMenu' : 'authLogin')}</span><Icon name="down" size={14} />
    </button>
    {reason === 'expired' && <span className="account-session-status" role="status" title={t('authExpired')}>{t('authExpiredShort')}</span>}
    {menuOpen && <div className="account-menu" id="account-options" role="menu" aria-labelledby="account-trigger" ref={menu} onKeyDown={menuKeys}>
      {user ? <>
        <div className="account-identity" role="none"><span>{t('accountSignedIn')}</span><strong className="account-email">{user.email}</strong></div>
        {me.isError && <p className="account-error" role="status">{t(apiErrorMessage(me.error))}</p>}
        <button type="button" role="menuitem" onClick={() => { closeMenu(); dispatch(sessionEnded('signed-out')); }}>
          <Icon name="arrow" size={16} />{t('authLogout')}
        </button>
      </> : <>
        <button type="button" role="menuitem" onClick={() => openForm('login')}>{t('authLogin')}</button>
        <button type="button" role="menuitem" onClick={() => openForm('register')}>{t('authRegister')}</button>
      </>}
    </div>}
    {mode && <AuthForm key={mode} mode={mode} onClose={() => { setMode(null); trigger.current?.focus(); }} />}
  </div>;
}
