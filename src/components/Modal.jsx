export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/35 p-0 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface p-5 shadow-[0_-8px_40px_-8px_rgba(33,30,26,0.25)] sm:shadow-[0_20px_60px_-15px_rgba(33,30,26,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-medium text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-ink-faint hover:bg-paper hover:text-ink-soft"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
