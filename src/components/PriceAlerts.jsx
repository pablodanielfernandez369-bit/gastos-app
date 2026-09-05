import { useMemo } from 'react';
import { subcategoryMonthComparison } from '../lib/selectors';
import { formatARS } from '../lib/format';

const THRESHOLD_PCT = 5;

// Avisos de qué subcategorías subieron o bajaron respecto al mes calendario
// anterior, para tenerlo en cuenta (ej: "Insumos subió 20% vs el mes pasado").
export default function PriceAlerts({ state, limit, compact }) {
  const comparison = useMemo(() => subcategoryMonthComparison(state), [state]);
  const notable = comparison.filter((c) => Math.abs(c.deltaPct) >= THRESHOLD_PCT);
  const items = limit ? notable.slice(0, limit) : notable;

  if (items.length === 0) return null;

  return (
    <div className={compact ? 'rounded-xl border border-blue-200 bg-blue-50 p-4' : 'rounded-xl bg-white p-4 shadow-sm'}>
      <p className={compact ? 'mb-2 text-sm font-semibold text-blue-800' : 'mb-2 text-sm font-semibold text-gray-700'}>
        Cambios respecto al mes pasado
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const up = c.deltaPct > 0;
          return (
            <li key={c.subcategoryId} className="flex items-center justify-between text-sm">
              <span className={compact ? 'text-blue-900' : 'text-gray-700'}>{c.name}</span>
              <span className={`flex items-center gap-1 font-medium ${up ? 'text-warn' : 'text-ok'}`}>
                {up ? '▲' : '▼'} {Math.abs(c.deltaPct).toFixed(0)}%
                <span className="hidden text-xs font-normal text-gray-400 sm:inline">
                  ({formatARS(c.prev)} → {formatARS(c.curr)})
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {limit && notable.length > limit && (
        <p className="mt-2 text-xs text-gray-400">+{notable.length - limit} más en Reportes</p>
      )}
    </div>
  );
}
