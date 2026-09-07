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

      <div
        className={`rounded-2xl p-5 text-white shadow ${savingsPositive ? 'bg-ok' : 'bg-warn'}`}
      >
        <p className="text-sm opacity-90">Capacidad de ahorro</p>
        <p className="text-3xl font-bold">{formatARS(totals.savings)}</p>
        <p className="text-sm opacity-90">
          {toUsd(totals.savings) && <span>{toUsd(totals.savings)} · </span>}
          {totals.incomeTotal > 0
            ? `${totals.savingsPct.toFixed(1)}% de tus ingresos`
            : 'Cargá tus ingresos para ver el %'}
        </p>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-xs font-medium text-gray-500">Ahorro acumulado (desde siempre)</p>
        <p className="text-xl font-bold text-gray-900">{formatARS(allTime.savings)}</p>
        {toUsd(allTime.savings) && (
          <p className="text-sm text-gray-500">
            {toUsd(allTime.savings)}
            {rate && (
              <span className="text-xs text-gray-400">
                {' '}· dólar {formatNum(rate)}
                {state.config?.fxRateManual ? ' (fijado)' : ' blue'}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Ingresos</p>
          <p className="text-xl font-bold text-gray-900">{formatARS(totals.incomeTotal)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Gastos</p>
          <p className="text-xl font-bold text-gray-900">{formatARS(totals.expenseTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {state.groups.map((g) => (
          <div key={g.id} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs font-medium" style={{ color: g.color }}>{g.name}</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatARS(totals.expenseByGroup[g.id] || 0)}
            </p>
          </div>
        ))}
      </div>

      {totals.expenseByGroup._sinCategoria > 0 && (
        <p className="text-sm text-warn">
          {formatARS(totals.expenseByGroup._sinCategoria)} sin categorizar — revisalos en Movimientos.
        </p>
      )}
    </div>
  );
}

function formatNum(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
}
