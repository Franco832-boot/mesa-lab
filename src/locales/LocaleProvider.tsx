import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { es } from './es/messages';
import { LocaleContext } from './LocaleContext';
import type { Locale } from './LocaleContext';
import { en } from './en/messages';

const dictionaries = { es, en };
function initialLocale(): Locale {
  try {
    return localStorage.getItem('mesa.locale') === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('mesa.locale', locale);
    } catch {
      /* Language still works for this session. */
    }
  }, [locale]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: (key) => dictionaries[locale][key] }}>
      {children}
    </LocaleContext.Provider>
  );
}
