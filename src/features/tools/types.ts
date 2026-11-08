import type { TranslationKey } from '../../locales/es/messages';
export const toolTabs = ['components', 'code'] as const;
export type ToolTab = typeof toolTabs[number];
export const toolLabels: Record<ToolTab, TranslationKey> = {
  components: 'library', code: 'codeTab',
};
