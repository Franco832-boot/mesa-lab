import { useEffect } from 'react';

/** Fit the shell to the visible viewport when a virtual keyboard resizes or pans it. */
export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--visible-height', `${viewport.height}px`);
      root.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
      const editing = document.activeElement instanceof HTMLTextAreaElement;
      root.classList.toggle('keyboard-editing', editing && window.innerHeight - viewport.height > 100);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      root.style.removeProperty('--visible-height');
      root.style.removeProperty('--visible-top');
      root.classList.remove('keyboard-editing');
    };
  }, []);
}
