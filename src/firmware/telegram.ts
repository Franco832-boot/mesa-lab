/** Local text transport for one simulated bot per ESP8266 execution. */
export const TELEGRAM_CHAT_IDS = ['123456', '123457'] as const;
export const TELEGRAM_TEXT_LIMIT = 4096;
const PENDING_LIMIT = 64;
const HISTORY_LIMIT = 200;
type ChatId = typeof TELEGRAM_CHAT_IDS[number];
export interface ChatMessage {
  readonly id: number;
  readonly chatId: ChatId;
  readonly text: string;
  readonly from: 'user' | 'bot';
}
export interface TelegramState {
  readonly nextId: number;
  readonly pending: readonly ChatMessage[];
  readonly history: readonly ChatMessage[];
  readonly message: ChatMessage | null;
  readonly lastMessageReceived: number;
}
export const initialTelegram = (): TelegramState => ({
  nextId: 1, pending: [], history: [], message: null, lastMessageReceived: 0,
});
function chatId(value: string): ChatId | undefined {
  return TELEGRAM_CHAT_IDS.find((id) => id === value);
}
function append(state: TelegramState, message: ChatMessage): TelegramState {
  return { ...state, nextId: state.nextId + 1, history: [...state.history, message].slice(-HISTORY_LIMIT) };
}
export function enqueueTelegram(state: TelegramState, sender: string, text: string): TelegramState {
  const chat = chatId(sender);
  if (!chat || !text.trim() || text.length > TELEGRAM_TEXT_LIMIT || state.pending.length >= PENDING_LIMIT ||
    state.nextId >= 0x7fffffff) return state;
  const message: ChatMessage = { id: state.nextId, chatId: chat, text, from: 'user' };
  return { ...append(state, message), pending: [...state.pending, message] };
}
/** The library's default HANDLE_MESSAGES is 1. An offset acknowledges earlier updates. */
export function pollTelegram(state: TelegramState, offset: number): { state: TelegramState; count: number } {
  const pending = state.pending.filter((message) => message.id >= offset);
  const message = pending[0];
  if (!message || message.id === state.lastMessageReceived) {
    return { state: pending.length === state.pending.length ? state : { ...state, pending }, count: 0 };
  }
  return { state: { ...state, pending, message, lastMessageReceived: message.id }, count: 1 };
}
export function replyTelegram(state: TelegramState, recipient: string, text: string): TelegramState {
  const chat = chatId(recipient);
  if (!chat || !text.length || text.length > TELEGRAM_TEXT_LIMIT || state.nextId >= 0x7fffffff) return state;
  return append(state, { id: state.nextId, chatId: chat, text, from: 'bot' });
}
