import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import { netReimbursements, computeTotals, monthBounds, usdNet, expensesInRange, incomesInRange, monthOverMonthTotals } from '../lib/selectors';
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
  // Mes que se está mirando en Billeteras (independiente del PeriodFilter de
  // más abajo, que es para Capacidad de ahorro/Ingresos/Gastos). Empieza en
  // el mes real de hoy; navegar no cambia la fecha real, solo qué mes se ve.
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // En "Mes" el período es el mes que se está mirando en MonthNav (no
  // siempre el mes real de hoy): al ir a un mes anterior, ingresos/gastos/
  // capacidad de ahorro de abajo muestran ese mismo mes.
  const [from, to] = useMemo(
    () => (period === 'mes' ? monthBounds(viewMonth) : rangeForPeriod(period, customFrom, customTo)),
    [period, customFrom, customTo, viewMonth]
  );

  const totals = useMemo(() => computeTotals(state, from, to), [state, from, to]);
  // Ahorro del mes que se está mirando arriba (MonthNav): cada mes es
  // aparte, no se arrastra lo de meses anteriores.
  const monthTotals = useMemo(() => computeTotals(state, ...monthBounds(viewMonth)), [state, viewMonth]);
  const mom = useMemo(() => monthOverMonthTotals(state, viewMonth), [state, viewMonth]);

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
  const rate = usdRate(state.config, dolar);

  const savingsPositive = totals.savings >= 0;

  return (
    <div className="space-y-4">
      <DolarStrip dolar={dolar} manual={state.config?.fxRateManual} />
      <MonthNav viewMonth={viewMonth} onChange={(m) => { setViewMonth(m); setPeriod('mes'); }} />
      <BudgetGoals state={state} actions={actions} now={viewMonth} />
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
            <p className="mt-2 font-numeral text-[2.7rem] font-medium leading-none tracking-tight text-ink num">
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
            <SwapNote swaps={totals.swaps} savingsArs={totals.savingsByCurrency.ars} rate={rate} className="mt-1" />
            {hasUsdActivity(totals) && (
              <p className="mt-1 font-numeral text-xl font-medium text-ink num">
                {formatUsd(totals.savingsByCurrency.usd)}{' '}
                <span className="text-sm font-normal text-ink-faint">de ahorro en dólares</span>
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-hair bg-surface p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Ahorro del mes
            </p>
            <p className="mt-1 font-numeral text-2xl font-medium text-ink num">
              {formatARS(monthTotals.savingsByCurrency.ars)}
            </p>
            <SwapNote swaps={monthTotals.swaps} savingsArs={monthTotals.savingsByCurrency.ars} rate={rate} className="mt-1" />
            {(hasUsdActivity(monthTotals) || usdNet(monthTotals) !== 0) && (
              <p className="mt-1 text-sm text-ink-soft num">{formatUsd(usdNet(monthTotals))}</p>
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
    return <p className="mt-1 text-xs text-ink-faint">≈ igual que el mes anterior</p>;
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
        <span className="font-numeral text-lg font-medium text-ink num">${formatNum(value)}</span>
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

// Mes que se muestra en Billeteras: flechas para ir al mes anterior/
// siguiente, o tocar el nombre para elegir cualquier otro de una lista.
// Los meses sin datos (futuros, o anteriores a que Pablo empezara a usar
// la app) simplemente se ven en $0 — las billeteras ya filtran por mes,
// no hace falta ningún caso especial para eso.
function MonthNav({ viewMonth, onChange }) {
  const [open, setOpen] = useState(false);
  const label = viewMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

  const months = useMemo(() => {
    const real = new Date();
    const list = [];
    for (let i = 3; i >= -14; i--) {
      list.push(new Date(real.getFullYear(), real.getMonth() + i, 1));
    }
    return list;
  }, []);

  function shift(delta) {
    onChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1));
  }

  return (
    <div className="flex items-center justify-between px-1">
      <button
        type="button"
        onClick={() => shift(-1)}
        aria-label="Mes anterior"
        className="px-2 py-1 text-lg text-ink-faint"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-display text-[1rem] font-medium capitalize text-ink"
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() => shift(1)}
        aria-label="Mes siguiente"
        className="px-2 py-1 text-lg text-ink-faint"
      >
        ›
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Elegir mes">
        <ul className="divide-y divide-hair">
          {months.map((m) => {
            const isSelected = m.getFullYear() === viewMonth.getFullYear() && m.getMonth() === viewMonth.getMonth();
            return (
              <li key={m.toISOString()}>
                <button
                  type="button"
                  onClick={() => { onChange(m); setOpen(false); }}
                  className={`w-full py-2.5 text-left text-sm capitalize ${isSelected ? 'font-semibold text-accent' : 'text-ink'}`}
                >
                  {m.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

// De todo el ahorro en pesos, cuánto está puesto en dólares (al valor de compra)
// y cuánto sigue líquido en pesos.
// Cuánto de tu ahorro en pesos está convertido a dólares. Antes mostraba el
// neto histórico de lo que entró/salió en cada compra/venta (`swaps.ars`),
// que con compra y venta a cotizaciones distintas (ej compré a 1540, vendí a
// 1550) no coincide con lo que esos dólares valen HOY — se valúa siempre a
// la cotización actual para que "líquido en pesos" sea el número real.
function SwapNote({ swaps, savingsArs, rate, className = '' }) {
  if (!swaps || swaps.usd <= 0) return null;
  const valorHoy = rate ? swaps.usd * rate : swaps.ars;
  return (
    <p className={`text-sm text-ink-soft num ${className}`}>
      Incluye {formatARS(valorHoy)} en US$ {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(swaps.usd)}
      {rate ? ' al dólar de hoy' : ' comprados'}
      {' · '}líquido en pesos {formatARS(savingsArs - valorHoy)}
    </p>
  );
}
