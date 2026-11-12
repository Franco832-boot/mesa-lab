import { useEffect, useState } from 'react';

export const COMPACT_LAYOUT_QUERY = '(max-width: 768px)';

export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(COMPACT_LAYOUT_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
