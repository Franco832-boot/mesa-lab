import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL, contactMailto } from './contact';
import { ContactCard } from './ContactCard';
import { LocaleProvider } from '../../locales/LocaleProvider';
import { es } from '../../locales/es/messages';
import { en } from '../../locales/en/messages';

describe('owner-confirmed editable email drafts', () => {
  it('encodes editable fields without adding recipients or headers', () => {
    expect(CONTACT_EMAIL).toBe('franco.bettiol@gmail.com');
    const href = contactMailto('Consulta & módulo #1', 'Modelo: A&B\nUso: LED');
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:'); expect(url.pathname).toBe(CONTACT_EMAIL);
    expect([...url.searchParams.keys()]).toEqual(['subject', 'body']);
    expect(url.searchParams.get('subject')).toBe('Consulta & módulo #1');
    expect(url.searchParams.get('body')).toBe('Modelo: A&B\r\nUso: LED');
  });
  it('uses the confirmed address and supplies the suggested fields in both languages', () => {
    for (const messages of [es, en]) {
      const url = new URL(contactMailto(messages.requestModuleSubject, messages.requestModuleBody));
      expect(url.pathname).toBe(CONTACT_EMAIL);
      expect(url.searchParams.get('body')?.split('\r\n').filter((line) => line.endsWith(':'))).toHaveLength(3);
    }
    for (const kind of ['project', 'module'] as const) {
      const html = renderToStaticMarkup(createElement(LocaleProvider, { children: createElement(ContactCard, { kind }) }));
      expect(html).toContain(`mailto:${CONTACT_EMAIL}?subject=`);
      expect(html).not.toContain('draggable');
      expect(html).not.toContain('component-card');
    }
  });
});
