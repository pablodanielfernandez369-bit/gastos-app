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
      <DolarStrip dolar={dolar} manual={state.config?.fxRateManual} />
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

      <div className="space-y-4 sm:grid sm:grid-cols-2 sm:items-start sm:gap-4 sm:space-y-0">
        <div className="space-y-4">
          <div className="pt-1 sm:pt-0">
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
                    {state.config?.fxRateManual ? ' (fijado)' : ' blue prom.'}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3">
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
      </div>
    </div>
  );
}

function formatNum(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
}

function DolarStrip({ dolar, manual }) {
  if (!dolar && !manual) return null;
  const value = manual || dolar?.promedio || dolar?.venta;
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between rounded-2xl border border-hair bg-surface-2 px-4 py-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Dólar blue hoy
      </span>
      <span className="text-right">
        <span className="font-display text-lg font-medium text-ink num">${formatNum(value)}</span>
        {!manual && dolar?.compra && dolar?.venta && (
          <span className="ml-2 text-xs text-ink-faint num">
            {formatNum(dolar.compra)} / {formatNum(dolar.venta)}
          </span>
        )}
        {manual && <span className="ml-2 text-xs text-ink-faint">fijado</span>}
      </span>
    </div>
  );
}
