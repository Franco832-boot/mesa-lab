// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { preparePreview, createPreviewShell } from './webPreviewDocument';
import type { HttpResponse } from '../../firmware/http';

const response = (body: string, contentType = 'text/html'): HttpResponse => ({ status: 200, contentType, body });
describe('preview capability boundary', () => {
  it('loads scripts and CSS only through registered local HTTP responses', () => {
    const paths: string[] = [];
    const page = preparePreview((path) => {
      paths.push(path);
      if (path === '/') return response('<link rel="stylesheet" href="theme.css"><button id="on">On</button><script src="app.js"></script>');
      return path === '/app.js' ? response('fetch("/on")', 'text/javascript') : response('body{color:red}', 'text/css');
    });
    expect(paths).toEqual(['/', '/app.js', '/theme.css']);
    expect(page.scripts).toEqual(['fetch("/on")']);
    expect(page.html).toContain('<style>body{color:red}</style>');
    expect(page.html).not.toContain('<script');
    const previewShell = createPreviewShell('a'.repeat(32));
    expect(previewShell).not.toContain('fetch("/on")');
    expect(previewShell).toContain("connect-src 'none'");
  });
  it('removes navigation, handlers, embedded documents and active namespaces', () => {
    const page = preparePreview(() => response('<body onload="escape()"><meta http-equiv="refresh" content="0;url=http://localhost"><iframe src="http://localhost"></iframe><svg onload="escape()"></svg><a href="javascript:escape()" ping="http://localhost">x</a><form action="http://localhost"><button formaction="http://localhost">Go</button></form><img srcset="http://localhost 2x"></body>'));
    expect(page.html).not.toMatch(/onload|iframe|<svg|href=|ping=|action=|srcset|refresh/);
  });
  it.each(['http://localhost/a.js', '//localhost/a.js', '../a.js', '/%2e/a.js'])('rejects external and traversal script resources: %s', (src) => {
    expect(() => preparePreview(() => response(`<script src="${src}"></script>`))).toThrow('400');
  });
  it('reports a missing or incorrectly typed resource instead of fabricating its contents', () => {
    expect(() => preparePreview((path) => path === '/' ? response('<script src="x.js"></script>') : { status: 404, contentType: 'text/plain', body: 'missing' })).toThrow('404');
    expect(() => preparePreview(() => response('<script type="module">import x from "x"</script>'))).toThrow('415');
  });
});

describe('bounded passive content', () => {
  it('removes CSS network syntax and untrusted at-rules while preserving static local styling', () => {
    const page = preparePreview(() => response('<style>@import "https://x.invalid";@font-face{src:url(https://x.invalid/font)}body{background-image:u\\72l(https://x.invalid/img);color:red}@media(max-width:500px){button{padding:12px}}</style><p style="background:url(data:text/plain,x);color:blue">Safe</p>'));
    expect(page.html).not.toMatch(/@import|@font-face|url\(|https:/i);
    expect(page.html).toContain('color:red'); expect(page.html).toContain('color:blue');
    expect(page.html).toContain('@media');
  });
  it('enforces byte, node, script and cumulative style-rule limits before creating a frame', () => {
    for (const body of ['x'.repeat(96001), '<b></b>'.repeat(1001), '<script>0;</script>'.repeat(17), '<style>p{color:red}</style>'.repeat(257)])
      expect(() => preparePreview(() => response(body))).toThrow('413');
  });
  it('does not let CSS or markup gain privileged DOM controls', () => {
    const page = preparePreview(() => response('<input type="file" autofocus><div data-mesa-path="/led/on" onclick="x()">Safe</div><style>p{--exfil:url(https://x.invalid);background:var(--exfil)}</style>'));
    expect(page.html).not.toMatch(/type="file"|autofocus|onclick|data-mesa-path|url\(|var\(/);
  });
  it('accepts standard classic-JS MIME and reports unsupported MIME as an error instead of HTTP 200', () => {
    const root = response('<script src="app.js"></script>');
    expect(preparePreview(path => path === '/' ? root : response('0;', 'application/javascript')).scripts).toEqual(['0;']);
    expect(() => preparePreview(path => path === '/' ? root : response('<p>wrong</p>'))).toThrow('415');
  });
});
