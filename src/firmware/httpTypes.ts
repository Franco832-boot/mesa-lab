export interface HttpResponse { status: number; contentType: string; body: string }
export interface WebServer {
  began: boolean;
  polling: boolean;
  routes: Readonly<Record<string, { handler: string } | { file: string }>>;
}
export interface FirmwareHttp {
  fs: boolean;
  servers: Readonly<Record<string, WebServer>>;
  requestServer: string | null;
  response: HttpResponse | null;
}
export const initialFirmwareHttp = (): FirmwareHttp => ({ fs: false, servers: {}, requestServer: null, response: null });
/** Only local GET paths. Never interpret an origin, query, traversal or network URL. */
export function localHttpPath(path: string): boolean {
  return /^\/(?:[A-Za-z0-9_.-]+\/?)*$/.test(path) && !path.split('/').some((part) => part === '.' || part === '..');
}
