import type { HttpResponse } from '../../firmware/httpTypes';
import { WEB_LIMITS, virtualResourcePath } from './webPreviewProtocol';
import { previewCss, previewDeclarations } from './webPreviewCss';
export { createPreviewShell } from './webPreviewShell';

export interface PreviewPage { html: string; scripts: readonly string[] }
const tags = new Set('a abbr article aside b blockquote br button caption code col colgroup dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label legend li main nav ol optgroup option output p pre progress section select small span strong sub summary sup table tbody td textarea th thead time tr u ul style script link'.split(' '));
const attributes = new Set('id class title role lang dir for type name value checked selected disabled readonly required placeholder min max step maxlength rows cols multiple open colspan rowspan scope tabindex'.split(' '));
export function preparePreview(request: (path: string) => HttpResponse, path = '/'): PreviewPage {
  const root = request(virtualResourcePath(path));
  if (root.status !== 200) throw new Error(String(root.status));
  if (!root.contentType.toLowerCase().startsWith('text/html')) throw new Error('415');
  if (root.body.length > WEB_LIMITS.html) throw new Error('413');
  const parsed = document.createElement('template');
  parsed.innerHTML = root.body;
  const tree = parsed.content;
  if (tree.querySelectorAll('*').length > WEB_LIMITS.nodes) throw new Error('413');
  let total = root.body.length, resources = 0, scriptSize = 0;
  const scripts: string[] = [];
  const cssBudget = { rules: 0, declarations: 0 };
  const resource = (value: string, type: 'css' | 'js') => {
    if (++resources > WEB_LIMITS.resources) throw new Error('413');
    const result = request(virtualResourcePath(value, path));
    if (result.status !== 200) throw new Error(String(result.status));
    const mime = result.contentType.split(';')[0]?.trim().toLowerCase();
    if (type === 'css' ? mime !== 'text/css' : mime !== 'text/javascript' && mime !== 'application/javascript') throw new Error('415');
    total += result.body.length;
    if (result.body.length > WEB_LIMITS[type] || total > WEB_LIMITS.total) throw new Error('413');
    return result.body;
  };
  // Remove unknown active namespaces/containers before extracting any script.
  for (const node of tree.querySelectorAll('*')) if (node.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(node.localName)) node.remove();
  for (const script of tree.querySelectorAll('script')) {
    if (script.type && !['text/javascript', 'application/javascript'].includes(script.type)) throw new Error('415');
    const source = script.hasAttribute('src') ? resource(script.getAttribute('src') ?? '', 'js') : script.textContent;
    scriptSize += source.length;
    if (scriptSize > WEB_LIMITS.js) throw new Error('413');
    if (scripts.length >= WEB_LIMITS.resources) throw new Error('413');
    scripts.push(source); script.remove();
  }
  for (const link of tree.querySelectorAll('link')) {
    if (link.rel === 'stylesheet') {
      const style = document.createElement('style');
      style.textContent = resource(link.getAttribute('href') ?? '', 'css'); link.replaceWith(style);
    } else link.remove();
  }
  for (const style of tree.querySelectorAll('style')) style.textContent = previewCss(style.textContent, 0, cssBudget);
  for (const node of tree.querySelectorAll('*')) {
    if (node.localName === 'input') {
      if (!['text','password','number','checkbox','radio','range','button','submit','reset','hidden'].includes(node.getAttribute('type') ?? 'text')) node.setAttribute('type', 'text');
    }
    const nativePath = node.localName === 'form' ? node.getAttribute('action') : node.localName === 'a' ? node.getAttribute('href') : null;
    const method = (node.getAttribute('method') ?? 'get').toLowerCase();
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      if (name === 'style') {
        const safe = previewDeclarations(attribute.value, cssBudget);
        if (safe) node.setAttribute('style', safe); else node.removeAttribute(attribute.name);
      } else if (!attributes.has(name) && !/^aria-[a-z-]+$/.test(name)) node.removeAttribute(attribute.name);
    }
    if (['input','form','textarea'].includes(node.localName)) node.setAttribute('autocomplete', 'off');
    if (nativePath && method === 'get') {
      try { node.setAttribute('data-mesa-path', virtualResourcePath(nativePath, path)); } catch { /* External/native navigation stays absent. */ }
    }
  }
  const html = parsed.innerHTML;
  total += html.length;
  if (total > WEB_LIMITS.total) throw new Error('413');
  return { html, scripts };
}
