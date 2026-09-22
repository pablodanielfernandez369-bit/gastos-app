import { useMemo, useState } from 'react';
import { computeMonthBudget, computeStreak, computeLocalBalance, computeTotals } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';
import { useDolar, usdRate } from '../lib/useDolar';
import Modal from './Modal';

// Semáforo del presupuesto de extras/día a día del mes en curso. Siempre usa
// el mes calendario actual, sin importar el filtro de período del dashboard
// (las metas son mensuales).
const STATUS = {
  verde: { bar: 'bg-ok', text: 'text-ok', box: 'border-hair bg-surface' },
  amarillo: { bar: 'bg-caution', text: 'text-caution', box: 'border-caution/40 bg-caution/5' },
  rojo: { bar: 'bg-warn', text: 'text-warn', box: 'border-warn/40 bg-warn/5' },
};

// Las billeteras: Vivienda, Día a día, Salidas/Ocio, Dólares y Local, todas
// ancho completo (una debajo de otra), sin mensajes de ritmo/proyección —
// solo el número y, donde hay presupuesto, la barra de avance.
export default function BudgetGoals({ state }) {
  const b = useMemo(() => computeMonthBudget(state), [state]);
  const streak = useMemo(() => computeStreak(state), [state]);
  const local = useMemo(() => computeLocalBalance(state), [state]);
  const hasLocalActivity = Boolean(local && (local.spent > 0 || local.reimbursed > 0));
  // Ahorro en USD acumulado (todo el historial, no el mes): es lo que
  // muestra la billetera "Dólares" — mismo dato que ya se ve en el
  // Dashboard como "de ahorro en dólares", nada nuevo se calcula.
  const allTime = useMemo(() => computeTotals(state, null, null), [state]);
  const dolar = useDolar();
  const usdToArs = usdRate(state.config, dolar);

  return (
    <div>
      <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.13em] text-ink-faint">
        Billeteras
      </p>
      <div className="flex flex-col gap-3">
        {b.vivienda && <ViviendaCard v={b.vivienda} />}
        {b.diaADia && <DiaADiaCard d={b.diaADia} state={state} />}
        {b.extras && <ExtrasCard e={b.extras} streak={streak} state={state} />}
        <DolaresCard usd={allTime.savingsByCurrency.usd} rate={usdToArs} />
        {hasLocalActivity && <LocalBalanceCard l={local} state={state} />}
      </div>
    </div>
  );
}

function ViviendaCard({ v }) {
  return (
    <div className="rounded-2xl border border-hair bg-surface p-4">
      <p className="font-display text-[0.95rem] font-medium text-ink">Vivienda</p>
      <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
        {formatARS(v.spent)}
      </p>
      <p className="mt-2.5 text-xs text-ink-soft">Gastado este mes · sin presupuesto</p>
    </div>
  );
}

function DolaresCard({ usd, rate }) {
  const equivalent = rate ? usd * rate : null;
  return (
    <div className="rounded-2xl border border-hair bg-surface p-4">
      <p className="font-display text-[0.95rem] font-medium text-ink">Dólares</p>
      <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
        US$ {new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(usd || 0)}
      </p>
      <p className="mt-2.5 text-xs text-ink-soft num">
        {equivalent != null ? <>≈ {formatARS(equivalent)} al blue de hoy</> : 'Ahorro acumulado en dólares'}
      </p>
    </div>
  );
}

function LocalBalanceCard({ l, state }) {
  const owed = l.balance > 0;
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const gastos = state.expenses
      .filter((e) => e.groupId === l.groupId)
      .map((e) => ({ id: e.id, date: e.date, label: e.description || 'Gasto', amount: -e.amount }));
    const reembolsos = state.incomes
      .filter((i) => i.groupId === l.groupId)
      .map((i) => ({ id: i.id, date: i.date, label: i.description || 'Reembolso', amount: i.amount }));
    return [...gastos, ...reembolsos].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [open, state, l.groupId]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${owed ? 'border-caution/40 bg-caution/5' : 'border-hair bg-surface'}`}
      >
        <p className="font-display text-[0.95rem] font-medium text-ink">Local</p>
        <p className={`mt-1.5 font-display text-[1.6rem] font-medium leading-none num ${owed ? 'text-caution' : 'text-ok'}`}>
          {formatARS(Math.abs(l.balance))}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft num">
          {owed ? 'te deben' : l.balance < 0 ? 'repusiste de más' : 'al día'}
        </p>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Local">
        <p className="mb-3 text-sm text-ink-soft num">
          {formatARS(l.spent)} gastado − {formatARS(l.reimbursed)} repuesto ={' '}
          <span className="font-semibold text-ink">{formatARS(l.balance)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">{formatDate(it.date)}</p>
                </div>
                <p className={`shrink-0 text-sm font-semibold num ${it.amount < 0 ? 'text-ink' : 'text-ok'}`}>
                  {it.amount < 0 ? '−' : '+'}{formatARS(Math.abs(it.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function ExtrasCard({ e, streak, state }) {
  const st = STATUS[e.status];
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(new Date().toISOString());
    const extrasGroupId = state.config?.extrasGroupId;
    return state.expenses
      .filter((ex) => monthKey(ex.date) === currKey && ex.groupId === extrasGroupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((ex) => ({
        id: ex.id,
        date: ex.date,
        label: ex.description || state.subcategories.find((s) => s.id === ex.subcategoryId)?.name || 'Salida',
        sub: ex.description ? state.subcategories.find((s) => s.id === ex.subcategoryId)?.name : null,
        amount: ex.amount,
      }));
  }, [open, state]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${st.box}`}
      >
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[0.95rem] font-medium text-ink">Salidas / gastos extras</p>
          <p className={`text-sm font-semibold num ${st.text}`}>{toPct(e.pct)}</p>
        </div>
        {streak && streak.streak > 0 && (
          <p className="mt-0.5 text-xs font-medium text-ok">
            🔥 {streak.streak} {streak.streak === 1 ? 'día' : 'días'} en verde este mes
          </p>
        )}
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(e.spent)}{' '}
          <span className="text-sm font-normal text-ink-faint">de {formatARS(e.budget)}</span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(e.pct)}%` }} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Salidas / gastos extras">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(e.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
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
    </>
  );
}

function DiaADiaCard({ d, state }) {
  const st = STATUS[d.status];
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(new Date().toISOString());
    const diaADiaGroupId = state.config?.diaADiaGroupId;
    return state.expenses
      .filter((ex) => monthKey(ex.date) === currKey && ex.groupId === diaADiaGroupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((ex) => ({
        id: ex.id,
        date: ex.date,
        label: ex.description || state.subcategories.find((s) => s.id === ex.subcategoryId)?.name || 'Día a día',
        sub: ex.description ? state.subcategories.find((s) => s.id === ex.subcategoryId)?.name : null,
        amount: ex.amount,
      }));
  }, [open, state]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${st.box}`}
      >
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[0.95rem] font-medium text-ink">Día a día</p>
          <p className={`text-sm font-semibold num ${st.text}`}>{toPct(d.pct)}</p>
        </div>
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(d.spent)}{' '}
          <span className="text-sm font-normal text-ink-faint">de {formatARS(d.budget)}</span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(d.pct)}%` }} />
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Día a día">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(d.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
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
    </>
  );
}

function toPct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}
function clampPct(x) {
  return Math.max(0, Math.min(100, (x || 0) * 100));
}
