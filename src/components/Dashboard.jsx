import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import { computeTotals, expensesInRange, incomesInRange, monthOverMonthTotals } from '../lib/selectors';
import { formatARS, formatDate, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';
import { useDolar, usdRate } from '../lib/useDolar';
import RecurringReminders from './RecurringReminders';
import PriceAlerts from './PriceAlerts';
import BudgetGoals from './BudgetGoals';
import Modal from './Modal';

export default function Dashboard({ state, actions }) {
  const [period, setPeriod] = useState('mes');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [detail, setDetail] = useState(null); // { title, kind: 'income'|'expense', groupId? }

  const [from, to] = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const totals = useMemo(() => computeTotals(state, from, to), [state, from, to]);
  const allTime = useMemo(() => computeTotals(state, null, null), [state]);
  const mom = useMemo(() => monthOverMonthTotals(state), [state]);

  const detailItems = useMemo(() => {
    if (!detail) return [];
    if (detail.kind === 'income') {
      return incomesInRange(state, from, to)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((i) => ({ id: i.id, date: i.date, label: i.description || 'Ingreso', amount: i.amount }));
    }
    return expensesInRange(state, from, to)
      .filter((e) => !detail.groupId || e.groupId === detail.groupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((e) => {
        const sub = state.subcategories.find((s) => s.id === e.subcategoryId)?.name;
        const grp = state.groups.find((g) => g.id === e.groupId)?.name;
        const label = [sub, !detail.groupId ? grp : null].filter(Boolean).join(' · ');
        return {
          id: e.id,
          date: e.date,
          label: e.description || label || 'Gasto',
          sub: e.description ? label : null,
          amount: e.amount,
        };
      });
  }, [detail, state, from, to]);

  const detailTotal = detailItems.reduce((sum, it) => sum + it.amount, 0);

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
            <button
              type="button"
              onClick={() => setDetail({ title: 'Ingresos', kind: 'income' })}
              className="rounded-2xl border border-hair bg-surface p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">Ingresos</p>
              <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.incomeTotal)}</p>
              <DeltaTag delta={mom.income} goodDirection="up" />
            </button>
            <button
              type="button"
              onClick={() => setDetail({ title: 'Gastos', kind: 'expense' })}
              className="rounded-2xl border border-hair bg-surface p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">Gastos</p>
              <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.expenseTotal)}</p>
              <DeltaTag delta={mom.expense} goodDirection="down" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {state.groups.map((g) => (
              <button
                type="button"
                key={g.id}
                onClick={() => setDetail({ title: g.name, kind: 'expense', groupId: g.id })}
                className="rounded-2xl border border-hair bg-surface p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
              >
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.06em]" style={{ color: g.color }}>
                  {g.name}
                </p>
                <p className="mt-1 text-lg font-semibold text-ink num">
                  {formatARS(totals.expenseByGroup[g.id] || 0)}
                </p>
                <DeltaTag delta={mom.byGroup[g.id]} goodDirection="down" />
              </button>
            ))}
          </div>

          {totals.expenseByGroup._sinCategoria > 0 && (
            <p className="text-sm text-warn num">
              {formatARS(totals.expenseByGroup._sinCategoria)} sin categorizar — revisalos en Movimientos.
            </p>
          )}
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''}>
        <p className="mb-3 text-sm text-ink-soft num">
          Total del período: <span className="font-semibold text-ink">{formatARS(detailTotal)}</span>
        </p>
        {detailItems.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos en este período.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {detailItems.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink num">{formatARS(it.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function DeltaTag({ delta, goodDirection }) {
  if (!delta) return null;
  const pct = delta.deltaPct;
  if (Math.abs(pct) < 1) {
    return <p className="mt-1 text-xs text-ink-faint">≈ igual que el mes pasado</p>;
  }
  const up = pct > 0;
  const isGood = goodDirection === 'up' ? up : !up;
  return (
    <p className={`mt-1 text-xs num ${isGood ? 'text-ok' : 'text-warn'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}% vs mes pasado
    </p>
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
    <a
      href="https://dolarhoy.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-baseline justify-between rounded-2xl border border-hair bg-surface-2 px-4 py-3 transition active:scale-[0.98] hover:border-ink-faint"
    >
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
    </a>
  );
}
