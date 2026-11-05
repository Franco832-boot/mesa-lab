const paths = {
  rotate: 'M3 10a9 9 0 1 1 2 9M3 3v7h7',
  copy: 'M8 8h13v13H8ZM16 8V3H3v13h5',
  chip: 'M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm3 4h4v4h-4Z',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  library: 'M4 3h6v18H4ZM14 3h6v18h-6ZM7 7h0m10 0h0',
  inspector: 'M3 4h18v16H3ZM15 4v16M18 8h0m0 4h0',
  select: 'm5 3 14 10-7 1-3 7Z',
  hand: 'M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-1c-2 0-4-1-5-3l-4-6a2 2 0 0 1 3-2l2 2',
  wire: 'M5 5h6a3 3 0 0 1 3 3v8a3 3 0 0 0 3 3h2M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  undo: 'M9 4 4 9l5 5M4 9h9a6 6 0 0 1 6 6v3',
  redo: 'm15 4 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  play: 'm8 4 12 8-12 8Z',
  pause: 'M7 5h3v14H7Zm7 0h3v14h-3Z',
  stop: 'M6 6h12v12H6Z',
  save: 'M4 3h13l4 4v14H3V3h1Zm3 0v6h9V3M7 21v-8h10v8',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  check: 'm5 12 4 4L19 6',
  info: 'M12 11v6m0-10h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z',
  help: 'M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 3m0 3h.01M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z',
  code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
  wifi: 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01',
  globe: 'M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0ZM2 12h20M12 2c6 5 6 15 0 20-6-5-6-15 0-20Z',
  terminal: 'm4 6 6 6-6 6m9 0h7',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5Zm7 5v2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  folder: 'M3 5h7l2 3h9v12H3Z',
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
