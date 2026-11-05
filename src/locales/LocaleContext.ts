import { createContext } from 'react';
import type { TranslationKey } from './es/messages';

export type Locale = 'es' | 'en';
export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

/** Shared identity: provider and consumers must never allocate separate contexts. */
export const LocaleContext = createContext<LocaleContextValue | null>(null);
