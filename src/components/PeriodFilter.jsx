const OPTIONS = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'personalizado', label: 'Personalizado' },
];

export default function PeriodFilter({ period, setPeriod, customFrom, customTo, setCustomFrom, setCustomTo }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => setPeriod(o.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${
              period === o.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {period === 'personalizado' && (
        <div className="flex gap-2">
          <input
            type="date"
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
          />
          <input
            type="date"
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
