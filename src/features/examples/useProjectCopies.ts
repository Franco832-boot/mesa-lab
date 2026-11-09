import { useEffect, useState } from 'react';
import { listProjectCopies } from './replacement';
import type { ProjectCopy } from './replacement';

export function useProjectCopies(open: boolean, revision: number) {
  const [copies, setCopies] = useState<ProjectCopy[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    try {
      const result = listProjectCopies(localStorage);
      setCopies(result.copies); setError(result.unreadable > 0);
    } catch { setCopies([]); setError(true); }
  }, [open, revision]);
  return { copies, error };
}
