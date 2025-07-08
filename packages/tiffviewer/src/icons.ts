// Inline SVG icon definitions for TIFF viewer toolbar
export type IconKey =
  | "info"
  | "zoom-in"
  | "zoom-out"
  | "reset"
  | "fit"
  | "palette"
  | "arrow-left"
  | "arrow-right";

export const icons: Record<IconKey, string> = {
  info: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" stroke="#333" stroke-width="2" fill="#fff"/>
      <rect x="9" y="8" width="2" height="6" rx="1" fill="#333"/>
      <rect x="9" y="5" width="2" height="2" rx="1" fill="#333"/>
    </svg>
  `,
  "zoom-in": `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7" stroke="#333" stroke-width="2" fill="#fff"/>
      <rect x="8" y="5" width="2" height="8" rx="1" fill="#333"/>
      <rect x="5" y="8" width="8" height="2" rx="1" fill="#333"/>
      <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="#333" stroke-width="2"/>
    </svg>
  `,
  "zoom-out": `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7" stroke="#333" stroke-width="2" fill="#fff"/>
      <rect x="5" y="8" width="8" height="2" rx="1" fill="#333"/>
      <line x1="14.5" y1="14.5" x2="19" y2="19" stroke="#333" stroke-width="2"/>
    </svg>
  `,
  reset: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 10a6 6 0 1 1 2 4.47" stroke="#333" stroke-width="2" fill="none"/>
      <polyline points="2,14 6,14 6,10" stroke="#333" stroke-width="2" fill="none"/>
    </svg>
  `,
  fit: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" stroke="#333" stroke-width="2" fill="#e3f2fd"/>
      <rect x="7" y="7" width="6" height="6" rx="1" stroke="#333" stroke-width="1.5" fill="#fff"/>
    </svg>
  `,
  palette: `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="9" stroke="#333" stroke-width="2" fill="#fff"/>
      <circle cx="7" cy="8" r="1.5" fill="#e57373"/>
      <circle cx="13" cy="8" r="1.5" fill="#64b5f6"/>
      <circle cx="10" cy="13" r="1.5" fill="#81c784"/>
    </svg>
  `,
  "arrow-left": `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="13,5 7,10 13,15" stroke="#333" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
  "arrow-right": `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <polyline points="7,5 13,10 7,15" stroke="#333" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `,
};
