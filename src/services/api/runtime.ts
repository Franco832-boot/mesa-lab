import type { Credentials } from './contracts';

/** One instance per store. Secrets never enter Redux actions, state, persistence or query metadata. */
export class ApiRuntime {
  epoch = 0;
  userId: string | null = null;
  private token: string | null = null;
  private expiresAt = 0;
  private sequence = 0;
  private credentials = new Map<string, { epoch: number; credentials: Credentials }>();
  private controllers = new Set<AbortController>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  onExpired: () => void = () => undefined;

  clear(): void {
    this.epoch++;
    this.token = null;
    this.userId = null;
    this.expiresAt = 0;
    this.credentials.clear();
    clearTimeout(this.timer);
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
  authorization(): string | null {
    if (this.token && Date.now() >= this.expiresAt) { this.onExpired(); return null; }
    return this.token ? `Bearer ${this.token}` : null;
  }
  stageCredentials(credentials: Credentials): string {
    const id = String(++this.sequence);
    this.credentials.set(id, { epoch: this.epoch, credentials });
    return id;
  }
  takeCredentials(id: string) {
    const entry = this.credentials.get(id);
    this.credentials.delete(id);
    return entry;
  }
  authenticate(epoch: number, token: string, userId: string, expiresAt: number): boolean {
    if (epoch !== this.epoch) return false;
    this.token = token;
    this.userId = userId;
    this.expiresAt = expiresAt;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.onExpired(), Math.max(0, expiresAt - Date.now()));
    return true;
  }
  track(controller: AbortController): () => void {
    this.controllers.add(controller);
    return () => this.controllers.delete(controller);
  }
}
export function apiRuntime(extra: unknown): ApiRuntime {
  if (!(extra instanceof ApiRuntime)) throw new Error('API runtime is required');
  return extra;
}
