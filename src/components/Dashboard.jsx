import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import { netReimbursements, computeTotals, expensesInRange, incomesInRange, monthOverMonthTotals } from '../lib/selectors';
import { formatARS, formatDate, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';
import { useDolar } from '../lib/useDolar';
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

  const netted = useMemo(() => netReimbursements(state), [state]);

  const detailItems = useMemo(() => {
    if (!detail) return [];
    if (detail.kind === 'income') {
      return incomesInRange(netted, from, to)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((i) => ({
          id: i.id,
          date: i.date,
          label: i.description || 'Ingreso',
          amount: i.currency === 'USD' ? i.amountOriginal : i.amount,
          currency: i.currency,
        }));
    }
    return expensesInRange(netted, from, to)
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
          amount: e.currency === 'USD' ? e.amountOriginal : e.amount,
          currency: e.currency,
        };
      });
  }, [detail, state, netted, from, to]);

  // Los montos quedan por moneda, nunca se suman ARS con USD entre sí.
  const detailTotals = detailItems.reduce(
    (acc, it) => {
      if (it.currency === 'USD') acc.usd += it.amount;
      else acc.ars += it.amount;
      return acc;
    },
    { ars: 0, usd: 0 }
  );

  const dolar = useDolar();

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
              {formatARS(totals.savingsByCurrency.ars)}
            </p>
            <p className="mt-2.5 text-sm text-ink-soft num">
              {totals.incomeByCurrency.ars > 0 ? (
                <span className={`font-medium ${savingsPositive ? 'text-ok' : 'text-warn'}`}>
                  {totals.savingsPct.toFixed(0)}% de tus ingresos en pesos
                </span>
              ) : (
                'Cargá tus ingresos para ver el %'
              )}
            </p>
            <SwapNote swaps={totals.swaps} savingsArs={totals.savingsByCurrency.ars} className="mt-1" />
            {hasUsdActivity(totals) && (
              <p className="mt-1 font-display text-xl font-medium text-ink num">
                {formatUsd(totals.savingsByCurrency.usd)}{' '}
                <span className="text-sm font-normal text-ink-faint">de ahorro en dólares</span>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-hair bg-surface p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Ahorro acumulado
            </p>
            <p className="mt-1 font-display text-2xl font-medium text-ink num">
              {formatARS(allTime.savingsByCurrency.ars)}
            </p>
            <SwapNote swaps={allTime.swaps} savingsArs={allTime.savingsByCurrency.ars} className="mt-1" />
            {hasUsdActivity(allTime) && (
              <p className="mt-1 text-sm text-ink-soft num">{formatUsd(allTime.savingsByCurrency.usd)}</p>
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
              <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.incomeByCurrency.ars)}</p>
              {totals.incomeByCurrency.usd > 0 && (
                <p className="text-sm font-medium text-ink-soft num">{formatUsd(totals.incomeByCurrency.usd)}</p>
              )}
              <DeltaTag delta={mom.income} goodDirection="up" />
            </button>
            <button
              type="button"
              onClick={() => setDetail({ title: 'Gastos', kind: 'expense' })}
              className="rounded-2xl border border-hair bg-surface p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
            >
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">Gastos</p>
              <p className="mt-1 text-lg font-semibold text-ink num">{formatARS(totals.expenseByCurrency.ars)}</p>
              {totals.expenseByCurrency.usd > 0 && (
                <p className="text-sm font-medium text-ink-soft num">{formatUsd(totals.expenseByCurrency.usd)}</p>
              )}
              <DeltaTag delta={mom.expense} goodDirection="down" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {state.groups.map((g) => {
              // Reembolsos (ingresos marcados con este grupo, ej. Local) descuentan lo gastado.
              const reimbursed = incomesInRange(state, from, to)
                .filter((i) => i.groupId === g.id && i.currency !== 'USD')
                .reduce((sum, i) => sum + i.amount, 0);
              const groupArs = totals.expenseByGroup[g.id]?.ars || 0;
              return (
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
                  {formatARS(groupArs)}
                </p>
                {reimbursed > 0 && (
                  <p className="text-xs text-ink-faint num">repuesto {formatARS(reimbursed)}</p>
                )}
                {totals.expenseByGroup[g.id]?.usd > 0 && (
                  <p className="text-sm font-medium text-ink-soft num">
                    {formatUsd(totals.expenseByGroup[g.id].usd)}
                  </p>
                )}
                <DeltaTag delta={mom.byGroup[g.id]} goodDirection="down" />
              </button>
              );
            })}
          </div>

          {(totals.expenseByGroup._sinCategoria?.ars > 0 || totals.expenseByGroup._sinCategoria?.usd > 0) && (
            <p className="text-sm text-warn num">
              {totals.expenseByGroup._sinCategoria.ars > 0 && formatARS(totals.expenseByGroup._sinCategoria.ars)}
              {totals.expenseByGroup._sinCategoria.ars > 0 && totals.expenseByGroup._sinCategoria.usd > 0 && ' + '}
              {totals.expenseByGroup._sinCategoria.usd > 0 && formatUsd(totals.expenseByGroup._sinCategoria.usd)}
              {' '}sin categorizar — revisalos en Movimientos.
            </p>
          )}
        </div>
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''}>
        <p className="mb-3 text-sm text-ink-soft num">
          Total del período: <span className="font-semibold text-ink">{formatARS(detailTotals.ars)}</span>
          {detailTotals.usd > 0 && (
            <span className="font-semibold text-ink"> · {formatUsd(detailTotals.usd)}</span>
          )}
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
                <p className="shrink-0 text-sm font-semibold text-ink num">
                  {it.currency === 'USD' ? formatUsd(it.amount) : formatARS(it.amount)}
                </p>
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

function formatUsd(n) {
  return `US$ ${formatNum(n)}`;
}

// Solo mostramos la línea de dólares si hubo algún movimiento en esa moneda
// en el período — si el usuario no usa USD, no le aparece un "US$ 0" de más.
function hasUsdActivity(totals) {
  return totals.incomeByCurrency.usd !== 0 || totals.expenseByCurrency.usd !== 0;
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

// De todo el ahorro en pesos, cuánto está puesto en dólares (al valor de compra)
// y cuánto sigue líquido en pesos.
function SwapNote({ swaps, savingsArs, className = '' }) {
  if (!swaps || swaps.ars <= 0) return null;
  return (
    <p className={`text-sm text-ink-soft num ${className}`}>
      Incluye {formatARS(swaps.ars)} en US$ {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(swaps.usd)} comprados
      {' · '}líquido en pesos {formatARS(savingsArs - swaps.ars)}
    </p>
  );
}
