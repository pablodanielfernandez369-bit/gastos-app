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
    <div className={compact ? 'rounded-2xl border border-hair bg-surface-2 p-4' : 'rounded-2xl border border-hair bg-surface p-4'}>
      <p className="mb-2 font-display text-[0.9rem] font-medium text-ink">
        Cambios respecto al mes pasado
      </p>
      <ul className="space-y-1.5">
        {items.map((c) => {
          const up = c.deltaPct > 0;
          return (
            <li key={c.subcategoryId} className="flex items-center justify-between text-sm">
              <span className="text-ink">{c.name}</span>
              <span className={`flex items-center gap-1 font-medium num ${up ? 'text-warn' : 'text-ok'}`}>
                {up ? '▲' : '▼'} {Math.abs(c.deltaPct).toFixed(0)}%
                <span className="hidden text-xs font-normal text-ink-faint sm:inline">
                  ({formatARS(c.prev)} → {formatARS(c.curr)})
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      {limit && notable.length > limit && (
        <p className="mt-2 text-xs text-ink-faint">+{notable.length - limit} más en Reportes</p>
      )}
    </div>
  );
}
