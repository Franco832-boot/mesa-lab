import { useEffect, useRef, useState } from 'react';
import { TELEGRAM_CHAT_IDS, TELEGRAM_TEXT_LIMIT } from '../../firmware/telegram';
import type { TelegramState } from '../../firmware/telegram';
import { useLocale } from '../../locales/useLocale';
import type { SimulationStatus } from '../simulation/runtime';

export interface EspChatRuntime {
  status: SimulationStatus;
  telegram: TelegramState | null;
  send: (chatId: string, text: string) => boolean;
}

export function EspChatSimulation({ runtime }: { runtime: EspChatRuntime | undefined }) {
  const { t } = useLocale();
  const [sender, setSender] = useState<string>(TELEGRAM_CHAT_IDS[0]);
  const [draft, setDraft] = useState('');
  const [rejected, setRejected] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const messages = runtime?.telegram?.history;
  const lastMessage = messages?.at(-1)?.id;
  const canSend = runtime?.status === 'running' && runtime.telegram !== null;

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [sender, lastMessage]);

  return <section className="esp-chat" aria-label={t('espChatTab')}>
    <div className="esp-chat-header">
      <strong>{t('espChatSimulated')}</strong>
      <label>
        {t('espChatAccount')}
        <select value={sender} onChange={(event) => { setSender(event.target.value); setRejected(false); }}>
          {TELEGRAM_CHAT_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
    </div>
    <div className="esp-chat-log" ref={log} role="log" aria-label={t('espChatHistory')} tabIndex={0}>
      {messages?.filter((message) => message.chatId === sender).map((message) =>
        <p className="esp-chat-message" data-from={message.from} key={message.id}>
          <span>{t(message.from === 'bot' ? 'espChatBot' : 'espChatYou')}</span>
          {message.text}
        </p>,
      )}
    </div>
    <form className="esp-chat-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canSend || !draft.trim()) return;
      const accepted = runtime.send(sender, draft);
      setRejected(!accepted);
      if (accepted) setDraft('');
    }}>
      <input aria-label={t('espChatMessage')} placeholder={t('espChatMessage')} value={draft}
        maxLength={TELEGRAM_TEXT_LIMIT} disabled={!canSend}
        onChange={(event) => { setDraft(event.target.value); setRejected(false); }} />
      <button type="submit" className="primary-button" disabled={!canSend || !draft.trim()}>{t('espChatSend')}</button>
    </form>
    {!canSend && <p className="esp-chat-status" role="status">{t(runtime?.status === 'paused' ? 'espChatPaused'
      : runtime?.status === 'running' ? 'espChatUnavailable' : 'espChatStart')}</p>}
    {canSend && rejected && <p className="esp-chat-status" role="status">{t('espChatQueueFull')}</p>}
  </section>;
}
