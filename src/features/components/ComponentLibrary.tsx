import { useState } from 'react';
import type { ComponentKind } from '../../model/types';
import { useLocale } from '../../locales/useLocale';
import { Icon } from '../../shared/Icon';
import { catalog, ledOptions } from './catalog';
import type { CatalogEntry } from './catalog';
import type { TranslationKey } from '../../locales/es/messages';
import type { LedColor } from '../../model/components';
import { ComponentThumbnail } from './ComponentArtwork';

export function ComponentLibrary({
  embedded = false,
  locked,
  selectedKind,
  selectedColor,
  onAdd,
  onClose,
  onDragComponent,
}: {
  embedded?: boolean;
  locked: boolean;
  selectedKind: ComponentKind;
  selectedColor: LedColor | undefined;
  onAdd: (kind: ComponentKind, color?: LedColor) => void;
  onClose: () => void;
  onDragComponent: (value: { kind: ComponentKind; color?: LedColor } | null) => void;
}) {
  const { t } = useLocale();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'boards' | 'basic'>('all');
  const normalized = search
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const matching = catalog.filter(
    (item) =>
      (category === 'all' || item.category === category) &&
      `${t(item.name)} ${t(item.description)}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .includes(normalized),
  );
  const entries = matching.flatMap<
    CatalogEntry & { color: LedColor | undefined; colorLabel: TranslationKey | undefined }
  >((item) =>
    item.kind === 'led'
      ? ledOptions.map((color) => ({ ...item, color: color.value, colorLabel: color.label }))
      : [{ ...item, color: undefined, colorLabel: undefined }],
  );
  return (
    <aside id="component-library" data-testid="component-library" className="library-panel panel" aria-label={t('library')}>
      <div className="panel-heading">
        <div>
          <h2>
            {t('library')}
            <span className="count-badge">11</span>
          </h2>
          <p>{t('librarySubtitle')}</p>
        </div>
        {!embedded && <button className="icon-button panel-close" data-testid="library-close" onClick={onClose} aria-label={t('closeLibrary')}>
          <Icon name="close" size={16} />
        </button>}
      </div>
      <label className="search-field">
        <Icon name="search" size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
        />
      </label>
      <div className="category-tabs" aria-label={t('library')}>
        {(['all', 'boards', 'basic'] as const).map((item) => (
          <button
            key={item}
            aria-pressed={category === item}
            className={category === item ? 'selected' : ''}
            onClick={() => setCategory(item)}
          >
            {t(item)}
          </button>
        ))}
      </div>
      <div className="library-results">
        <span>
          {entries.length} {t('results')}
        </span>
        <span>{t('preview')}</span>
      </div>
      <div className="component-list">
        {entries.map((item) => (
          <button
            key={`${item.kind}-${item.color ?? ''}`}
            className={`component-card ${selectedKind === item.kind && (item.kind !== 'led' || selectedColor === item.color) ? 'selected' : ''}`}
            aria-pressed={
              selectedKind === item.kind && (item.kind !== 'led' || selectedColor === item.color)
            }
            disabled={locked}
            data-testid={`add-${item.kind}${item.color ? `-${item.color}` : ''}`}
            draggable={!locked}
            onDragStart={(event) => {
              onDragComponent({ kind: item.kind, ...(item.color ? { color: item.color } : {}) });
              event.dataTransfer.setData(
                'application/x-mesa-component',
                JSON.stringify({ kind: item.kind, color: item.color }),
              );
              event.dataTransfer.effectAllowed = 'copy';
            }}
            onDragEnd={() => onDragComponent(null)}
            onClick={() => onAdd(item.kind, item.color)}
            title={t('addComponent')}
          >
            <div className={`component-thumbnail thumbnail-${item.kind}`}>
              <ComponentThumbnail
                kind={item.kind}
                {...(item.color ? { properties: { color: item.color } } : {})}
              />
              {item.kind === 'esp8266' && (
                <span className="wifi-badge">
                  <Icon name="wifi" size={12} />
                </span>
              )}
            </div>
            <span className="component-card-copy">
              <strong>
                {t(item.name)}
                {item.colorLabel ? ` · ${t(item.colorLabel)}` : ''}
              </strong>
              <small>{t(item.description)}</small>
            </span>
            <Icon name="plus" size={14} />
          </button>
        ))}
        {entries.length === 0 && <p className="empty-results">{t('noResults')}</p>}
      </div>
      <div className="library-footer">
        <Icon name="info" size={16} />
        <p>{t(locked ? 'simulationLocked' : 'libraryHint')}</p>
      </div>
    </aside>
  );
}
