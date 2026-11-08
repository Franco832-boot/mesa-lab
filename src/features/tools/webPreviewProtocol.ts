import { localHttpPath } from '../../firmware/httpTypes';

/** Independent of browser globals; byte limits below count UTF-16 code units. */
export const WEB_LIMITS = {
  html: 96_000, css: 32_000, js: 64_000, total: 192_000, resources: 16,
  nodes: 1000, rules: 256, declarations: 1024, nesting: 3,
  path: 256, text: 8192, error: 512, requests: 512, pending: 16,
  requestsPerSecond: 30, messagesPerSecond: 240, messages: 10_000,
  requestTimeoutMs: 3000, heartbeatMs: 250, watchdogMs: 2000,
} as const;
export interface PreviewRequest { type: 'preview-http'; token: string; id: number; path: string }
export interface PreviewError { type: 'preview-error'; token: string; text: string }
function keys(value: object, allowed: readonly string[]): boolean {
  const names = Object.keys(value);
  return names.length === allowed.length && names.every((key) => allowed.includes(key));
}
export function previewMessage(value: unknown, token: string): PreviewRequest | PreviewError | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('token' in value) || value.token !== token || !('type' in value)) return null;
  if (value.type === 'preview-error' && keys(value, ['type', 'token', 'text']) && 'text' in value
    && typeof value.text === 'string' && value.text.length <= WEB_LIMITS.error) return { type: value.type, token, text: value.text };
  if (value.type !== 'preview-http' || !keys(value, ['type', 'token', 'id', 'path']) || !('id' in value) || !('path' in value)
    || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id < 1
    || typeof value.path !== 'string' || value.path.length > WEB_LIMITS.path || !localHttpPath(value.path)) return null;
  return { type: value.type, token, id: value.id, path: value.path };
}
/** Discrete fixed windows; actual wall time is supplied by the caller. */
export class PreviewBudget {
  private start = 0;
  private count = 0;
  private total = 0;
  constructor(private readonly perSecond: number, private readonly maximum: number) {}
  take(now: number): boolean {
    if (now - this.start >= 1000) { this.start = now; this.count = 0; }
    return ++this.count <= this.perSecond && ++this.total <= this.maximum;
  }
}
export function virtualResourcePath(value: string, base = '/'): string {
  const path = value.startsWith('/') ? value : `${base.slice(0, base.lastIndexOf('/') + 1)}${value}`;
  if (!value || path.length > WEB_LIMITS.path || !localHttpPath(path)) throw new Error('400');
  return path;
}
export function previewToken(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(16).padStart(8, '0')).join('');
}
