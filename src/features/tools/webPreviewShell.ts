import { WEB_LIMITS } from './webPreviewProtocol';
import { previewWorker } from './webPreviewWorker';

const shell = `
(() => {
  'use strict';
  const limits = ${JSON.stringify(WEB_LIMITS)};
  let worker, started = false, token, parentOrigin, nativeId = 1000000, lastPong = performance.now(), ping = 0;
  let start = performance.now(), count = 0, total = 0, watchdog;
  const content = document.getElementById('content'), output = document.getElementById('native-response');
  const nativePending = new Map(), listeners = new Set();
  const report = text => parent.postMessage({type:'preview-error', token, text:String(text).slice(0,limits.error)}, parentOrigin || '*');
  const dispose = () => {
    if (worker) worker.terminate(); worker = undefined;
    clearInterval(watchdog); for (const timer of nativePending.values()) clearTimeout(timer); nativePending.clear();
  };
  const fatal = text => { dispose(); report(text); };
  const allowedPath = path => typeof path === 'string' && path.length <= limits.path && /^\\/(?:[A-Za-z0-9_.-]+\\/?)*$/.test(path) && !path.split('/').some(part => part === '.' || part === '..');
  const budget = () => {
    const time = performance.now(); if (time - start >= 1000) { start = time; count = 0; }
    if (++count > limits.messagesPerSecond || ++total > limits.messages) { fatal('429'); return false; } return true;
  };
  window.addEventListener('message', event => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return;
    const data = event.data;
    if (data.type === 'boot' && !started && /^[a-f0-9]{32}$/.test(data.token) && typeof data.html === 'string'
      && data.html.length <= limits.total && Array.isArray(data.scripts) && data.scripts.length <= limits.resources
      && data.scripts.every(script => typeof script === 'string') && data.scripts.join('').length <= limits.js && ['es','en'].includes(data.lang)) {
      started = true; token = data.token; parentOrigin = event.origin;
      content.inert = true; content.innerHTML = data.html; document.documentElement.lang = data.lang;
      const prelude = ${JSON.stringify(previewWorker)}.replace('__MESA_CONFIG__', JSON.stringify({lang:data.lang, limits}));
      const url = URL.createObjectURL(new Blob([prelude, '\\n', ...data.scripts.map(script => script + '\\n;\\n')], {type:'text/javascript'}));
      worker = new Worker(url); URL.revokeObjectURL(url);
      lastPong = performance.now();
      watchdog = setInterval(() => {
        if (!worker) return;
        if (performance.now() - lastPong > limits.watchdogMs) { fatal('worker-timeout'); return; }
        worker.postMessage({type:'ping', id:++ping});
      }, limits.heartbeatMs);
      worker.onerror = event => { event.preventDefault(); fatal(event.message); };
      worker.onmessage = event => {
        const message = event.data;
        if (!worker || !message || typeof message !== 'object' || !budget()) return;
        if (message.type === 'pong' && Number.isSafeInteger(message.id) && message.id > 0 && message.id <= ping) { lastPong = performance.now(); return; }
        if (message.type === 'ready') { content.inert = false; return; }
        if (message.type === 'text' || message.type === 'listen') {
          if (typeof message.selector !== 'string' || message.selector.length > 256) { fatal('413'); return; }
          let node; try { node = content.querySelector(message.selector); } catch { fatal('element-missing'); return; }
          if (!node || ['STYLE','SCRIPT','LINK'].includes(node.tagName)) { fatal('element-missing'); return; }
          if (message.type === 'text') {
            if (typeof message.text !== 'string' || message.text.length > limits.text) { fatal('413'); return; }
            node.textContent = message.text;
          } else if (node instanceof HTMLElement && ['BUTTON','INPUT','SELECT','TEXTAREA'].includes(node.tagName)
            && ['click','input','change'].includes(message.event) && Number.isSafeInteger(message.id)) {
            if (listeners.size >= 256 || listeners.has(message.id)) { fatal('429'); return; }
            listeners.add(message.id);
            node.addEventListener(message.event, () => { if (worker) worker.postMessage({type:'event', event:message.event, id:message.id,
              value:('value' in node ? String(node.value) : '').slice(0,limits.text), checked:'checked' in node && node.checked === true}); });
          }
        } else if (message.type === 'http' && Number.isSafeInteger(message.id) && message.id > 0 && typeof message.path === 'string' && message.path.length <= limits.path) {
          if (!allowedPath(message.path)) worker.postMessage({type:'result', id:message.id, response:{status:400, contentType:'text/plain', body:'400'}});
          else parent.postMessage({type:'preview-http', token, id:message.id, path:message.path}, parentOrigin);
        } else if (message.type === 'error' && typeof message.text === 'string') fatal(message.text);
        else fatal('invalid-message');
      };
    } else if (started && data.token === token && event.origin === parentOrigin) {
      if (data.type === 'dispose') { dispose(); return; }
      if (data.type !== 'result' || !Number.isSafeInteger(data.id) || !data.response || typeof data.response.body !== 'string' || data.response.body.length > limits.html) return;
      if (nativePending.has(data.id)) { clearTimeout(nativePending.get(data.id)); nativePending.delete(data.id); output.textContent = data.response.status + ': ' + data.response.body; }
      else if (worker) worker.postMessage({type:'result', id:data.id, response:data.response});
    }
  });
  const nativeRequest = node => {
    const path = node.getAttribute('data-mesa-path');
    if (!worker || !allowedPath(path) || !budget()) return;
    if (nativePending.size >= limits.pending) { fatal('429'); return; }
    const id = ++nativeId;
    nativePending.set(id, setTimeout(() => fatal('408'), limits.requestTimeoutMs));
    parent.postMessage({type:'preview-http', token, id, path}, parentOrigin);
  };
  document.addEventListener('submit', event => { event.preventDefault(); if (event.target instanceof HTMLFormElement) nativeRequest(event.target); });
  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button,input[type="submit"]') : null;
    if ((button instanceof HTMLButtonElement || button instanceof HTMLInputElement) && button.type === 'submit' && button.form) {
      event.preventDefault(); nativeRequest(button.form); return;
    }
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (anchor) { event.preventDefault(); nativeRequest(anchor); }
  });
  window.addEventListener('pagehide', dispose);
})();
`;

export function createPreviewShell(nonce: string): string {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('invalid-nonce');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; font-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}</style></head><body><div id="content"></div><output id="native-response" role="status"></output><script nonce="${nonce}">${shell}</script></body></html>`;
}
