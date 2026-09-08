import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import { computeTotals } from '../lib/selectors';
import { formatARS, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';
import { useDolar, usdRate } from '../lib/useDolar';
import RecurringReminders from './RecurringReminders';
import PriceAlerts from './PriceAlerts';
import BudgetGoals from './BudgetGoals';

export default function Dashboard({ state, actions }) {
  const [period, setPeriod] = useState('mes');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());

  const [from, to] = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const totals = useMemo(() => computeTotals(state, from, to), [state, from, to]);
  const allTime = useMemo(() => computeTotals(state, null, null), [state]);

  const dolar = useDolar();
  const rate = usdRate(state.config, dolar);
  const toUsd = (ars) => (rate ? `US$ ${formatNum(ars / rate)}` : null);

  const savingsPositive = totals.savings >= 0;

  return (
    <div className="space-y-4">
      <BudgetGoals state={state} />
      <RecurringReminders state={state} actions={actions} />
      <PriceAlerts state={state} limit={3} compact />

      <PeriodFilter
        period={period}
        setPeriod={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
      />

      <div className="pt-1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-ink-faint">
          Capacidad de ahorro
        </p>
        <p className="mt-2 font-display text-[2.7rem] font-medium leading-none tracking-tight text-ink num">
          {formatARS(totals.savings)}
        </p>
        <p className="mt-2.5 text-sm text-ink-soft num">
          {toUsd(totals.savings) && <span>{toUsd(totals.savings)} · </span>}
          {totals.incomeTotal > 0 ? (
            <span className={`font-medium ${savingsPositive ? 'text-ok' : 'text-warn'}`}>
              {totals.savingsPct.toFixed(0)}% de tus ingresos
            </span>
          ) : (
            'Cargá tus ingresos para ver el %'
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-hair bg-surface p-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          Ahorro acumulado
        </p>
        <p className="mt-1 font-display text-2xl font-medium text-ink num">{formatARS(allTime.savings)}</p>
        {toUsd(allTime.savings) && (
          <p className="mt-1 text-sm text-ink-soft num">
            {toUsd(allTime.savings)}
            {rate && (
              <span className="text-xs text-ink-faint">
                {' '}· dólar {formatNum(rate)}
                {state.config?.fxRateManual ? ' (fijado)' : ' blue'}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-hair bg-surface p-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">Ingresos</p>
          <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.incomeTotal)}</p>
        </div>
        <div className="rounded-2xl border border-hair bg-surface p-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">Gastos</p>
          <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.expenseTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {state.groups.map((g) => (
          <div key={g.id} className="rounded-2xl border border-hair bg-surface p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.06em]" style={{ color: g.color }}>
              {g.name}
            </p>
            <p className="mt-1 text-lg font-semibold text-ink num">
              {formatARS(totals.expenseByGroup[g.id] || 0)}
            </p>
          </div>
        ))}
      </div>

      {totals.expenseByGroup._sinCategoria > 0 && (
        <p className="text-sm text-warn num">
          {formatARS(totals.expenseByGroup._sinCategoria)} sin categorizar — revisalos en Movimientos.
        </p>
      )}
    </div>
  );
}

function formatNum(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
}
