/** HTTP contracts checked against backend DTOs and /api/docs-json. Dates are JSON strings. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue }
export interface Credentials { email: string; password: string }
export interface UserResponse { id: string; email: string; createdAt: string }
export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserResponse;
}
export interface CreateProjectRequest { name: string; data: JsonObject }
export interface ProjectResponse extends CreateProjectRequest {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}
export interface TaskResponse {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  createdAt: string;
}
export interface ErrorResponse { statusCode: number; message: string | string[]; timestamp: string }

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
export function isUser(value: unknown): value is UserResponse {
  return record(value) && uuid(value.id) && typeof value.email === 'string' && date(value.createdAt);
}
export function publicUser(value: UserResponse): UserResponse {
  return { id: value.id, email: value.email, createdAt: value.createdAt };
}
export function isAuth(value: unknown): value is AuthResponse {
  return record(value) && typeof value.accessToken === 'string' && value.accessToken.length > 0
    && value.tokenType === 'Bearer' && typeof value.expiresIn === 'number'
    && Number.isSafeInteger(value.expiresIn) && value.expiresIn > 0 && value.expiresIn <= 86400 && isUser(value.user);
}

/** Same JSONB restrictions as the backend, including Unicode and depth. */
export function isJsonObject(value: unknown): value is JsonObject {
  if (!record(value)) return false;
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  const validText = (text: string) => !/[\u0000\uD800-\uDFFF]/u.test(text);
  while (stack.length) {
    const item = stack.pop();
    if (!item || item.depth > 64) return false;
    const child = item.value;
    if (child === null || typeof child === 'boolean') continue;
    if (typeof child === 'string') { if (!validText(child)) return false; continue; }
    if (typeof child === 'number') { if (!Number.isFinite(child)) return false; continue; }
    if (typeof child !== 'object' || seen.has(child)) return false;
    if (!Array.isArray(child) && Object.getPrototypeOf(child) !== Object.prototype && Object.getPrototypeOf(child) !== null) return false;
    seen.add(child);
    for (const [key, entry] of Object.entries(child)) {
      if (!validText(key)) return false;
      stack.push({ value: entry, depth: item.depth + 1 });
    }
  }
  return true;
}
export function isProject(value: unknown): value is ProjectResponse {
  return record(value) && uuid(value.id) && uuid(value.userId) && typeof value.name === 'string'
    && isJsonObject(value.data) && date(value.createdAt) && date(value.updatedAt);
}
export function isTask(value: unknown): value is TaskResponse {
  return record(value) && uuid(value.id) && uuid(value.userId) && typeof value.title === 'string'
    && typeof value.completed === 'boolean' && date(value.createdAt);
}
