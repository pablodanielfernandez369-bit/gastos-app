const PATHS = {
  dashboard: (
    <>
      <path d="M3 17l6-6 4 4 8-9" />
      <path d="M16 6h5v5" />
    </>
  ),
  movimientos: (
    <>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  reportes: (
    <>
      <rect x="4" y="13" width="4" height="7" rx="1" />
      <rect x="10" y="8" width="4" height="12" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </>
  ),
  asistente: (
    <>
      <path d="M4 6.8C4 5.25 5.25 4 6.8 4h10.4C18.75 4 20 5.25 20 6.8v6.4c0 1.55-1.25 2.8-2.8 2.8H10l-4 3v-3H6.8C5.25 16 4 14.75 4 13.2V6.8z" />
      <path
        d="M15.4 7l.55 1.25L17.2 8.8l-1.25.55-.55 1.25-.55-1.25L13.6 8.8l1.25-.55z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  ajustes: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="14" cy="7" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="13" x2="20" y2="13" />
      <circle cx="9" cy="13" r="2" fill="currentColor" stroke="none" />
      <line x1="4" y1="19" x2="20" y2="19" />
      <circle cx="16" cy="19" r="2" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function NavIcon({ id, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[id]}
    </svg>
  );
}
