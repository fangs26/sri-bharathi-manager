import { useEffect, useState } from 'react';

/** Subscribes to a media query, so layout can change without a reload. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Phone-sized. Used only where the layout genuinely differs in kind — tables
 * becoming cards, a sidebar becoming a bottom bar. Everything that is merely a
 * matter of spacing is done in CSS instead.
 */
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
