/** Trusted bootstrap only. Project scripts are appended AFTER this closed scope. */
export const previewWorker = `
const document = (() => {
  'use strict';
  const config = __MESA_CONFIG__, limits = config.limits;
  const emit = self.postMessage.bind(self), listen = self.addEventListener.bind(self);
  const timeout = self.setTimeout.bind(self), cancel = self.clearTimeout.bind(self);
  const now = performance.now.bind(performance);
  const callbacks = new Map(), pending = new Map();
  let sequence = 0, start = now(), count = 0, total = 0;
  const send = message => {
    const time = now(); if (time - start >= 1000) { start = time; count = 0; }
    if (++count > limits.messagesPerSecond || ++total > limits.messages) throw Error('429');
    emit(message);
  };
  const element = selector => Object.freeze({
    get textContent() { throw Error('unsupported-dom-read'); },
    set textContent(text) {
      const value = String(text);
      if (value.length > limits.text || selector.length > 256) throw Error('413');
      send({type:'text', selector, text:value});
    },
    addEventListener(type, callback) {
      if (!['click','input','change'].includes(type) || typeof callback !== 'function' || selector.length > 256) throw Error('unsupported-event');
      if (callbacks.size >= 256) throw Error('429');
      const id = ++sequence; callbacks.set(id, callback); send({type:'listen', selector, event:type, id});
    }
  });
  const documentFacade = Object.freeze({
    documentElement: Object.freeze({lang:config.lang}),
    querySelector: selector => element(String(selector)), getElementById: id => element('#' + String(id))
  });
  const virtualFetch = (path, options = {}) => new Promise((resolve, reject) => {
    if (options.method && options.method !== 'GET') { reject(Error('unsupported-method')); return; }
    if (pending.size >= limits.pending) { reject(Error('429')); return; }
    const target = String(path);
    if (target.length > limits.path) { reject(Error('413')); return; }
    const id = ++sequence;
    const timer = timeout(() => { pending.delete(id); reject(Error('408')); }, limits.requestTimeoutMs);
    pending.set(id, {resolve, reject, timer});
    try { send({type:'http', path:target, id}); } catch(error) { cancel(timer); pending.delete(id); reject(error); }
  });
  const seal = (name, value) => {
    for (let target = self; target; target = Object.getPrototypeOf(target))
      if (Object.prototype.hasOwnProperty.call(target, name)) Object.defineProperty(target, name, {value, writable:false, configurable:false});
    Object.defineProperty(self, name, {value, writable:false, configurable:false});
  };
  function blocked() { throw Error('unsupported-network'); }
  for (const name of ['XMLHttpRequest','WebSocket','WebSocketStream','EventSource','WebTransport','RTCPeerConnection',
    'Worker','SharedWorker','BroadcastChannel','MessageChannel','importScripts','caches','indexedDB','localStorage','sessionStorage','Notification','fetchLater','postMessage']) seal(name, blocked);
  seal('fetch', virtualFetch);
  seal('navigator', Object.freeze({language:config.lang, languages:Object.freeze([config.lang])}));
  listen('message', async event => {
    if (!event.isTrusted) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ping') { emit({type:'pong', id:data.id}); return; }
    if (data.type === 'result') {
      const promise = pending.get(data.id); if (!promise) return;
      pending.delete(data.id); cancel(promise.timer);
      promise.resolve(Object.freeze({status:data.response.status, ok:data.response.status >= 200 && data.response.status < 300,
        text:async () => data.response.body, json:async () => JSON.parse(data.response.body)}));
    } else if (data.type === 'event') {
      try { await callbacks.get(data.id)?.(Object.freeze({type:data.event, target:Object.freeze({value:data.value, checked:data.checked}), preventDefault() {}})); }
      catch(error) { send({type:'error', text:String(error).slice(0,limits.error)}); }
    }
  });
  listen('unhandledrejection', event => { event.preventDefault(); try { send({type:'error', text:String(event.reason).slice(0,limits.error)}); } catch {} });
  queueMicrotask(() => emit({type:'ready'}));
  return documentFacade;
})();
`;
