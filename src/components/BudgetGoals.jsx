import { useMemo, useState } from 'react';
import { computeMonthBudget, computeStreak, computeLocalBalance, computeTotals } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';
import { useDolar, usdRate } from '../lib/useDolar';
import Modal from './Modal';

// "Dólares" no es un grupo real (es transversal a toda la moneda), así que
// no tiene un color propio en state.groups — se fija acá, a tono con el
// resto de la paleta (dorado apagado).
const USD_COLOR = '#B08A2E';

// La tarjeta de cada billetera: un chip con la inicial + un degradé muy
// suave del color de esa categoría de fondo. El mismo color se usa en
// Movimientos/Reportes, así que la billetera queda coherente con el resto.
function WalletTile({ color, letter, onClick, children }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onClick()}
      className="flex cursor-pointer items-center gap-3 rounded-2xl border border-hair p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, #FCFAF5) 0%, #FCFAF5 75%)` }}
    >
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] font-display text-sm font-semibold text-surface"
        style={{ background: color }}
      >
        {letter}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// Las billeteras: Vivienda, Día a día, Salidas/Ocio, Dólares y Local, todas
// ancho completo (una debajo de otra), sin presupuesto ni mensajes de
// ritmo/proyección — solo el nombre, el gastado del mes (o el saldo, según
// la billetera) y el detalle de movimientos al tocarla.
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
        {b.vivienda && <ViviendaCard v={b.vivienda} state={state} />}
        {b.diaADia && <DiaADiaCard d={b.diaADia} state={state} />}
        {b.extras && <ExtrasCard e={b.extras} streak={streak} state={state} />}
        <DolaresCard
          usd={allTime.savingsByCurrency.usd + (allTime.swaps?.usd || 0)}
          rate={usdToArs}
          state={state}
        />
        {hasLocalActivity && <LocalBalanceCard l={local} state={state} />}
      </div>
    </div>
  );
}

function ViviendaCard({ v, state }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === v.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(new Date().toISOString());
    return state.expenses
      .filter((ex) => monthKey(ex.date) === currKey && ex.groupId === v.groupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((ex) => ({
        id: ex.id,
        date: ex.date,
        label: ex.description || state.subcategories.find((s) => s.id === ex.subcategoryId)?.name || 'Vivienda',
        sub: ex.description ? state.subcategories.find((s) => s.id === ex.subcategoryId)?.name : null,
        amount: ex.currency === 'USD' ? ex.amountOriginal : ex.amount,
        usd: ex.currency === 'USD',
      }));
  }, [open, state, v.groupId]);

  return (
    <>
      <WalletTile color={color} letter="V" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Vivienda</p>
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(v.spent)}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft">Gastado este mes · sin presupuesto</p>
      </WalletTile>

      <Modal open={open} onClose={() => setOpen(false)} title="Vivienda">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(v.spent)}</span>
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
                <p className="shrink-0 text-sm font-semibold text-ink num">
                  {it.usd ? formatUsdNum(it.amount) : formatARS(it.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function DolaresCard({ usd, rate, state }) {
  const [open, setOpen] = useState(false);
  const equivalent = rate ? usd * rate : null;

  const items = useMemo(() => {
    if (!open) return [];
    const rows = [];
    for (const i of state.incomes) {
      if (i.currency === 'USD') {
        rows.push({ id: 'i' + i.id, date: i.date, label: i.description || 'Ingreso', amount: i.amountOriginal, sign: 1 });
      }
    }
    for (const e of state.expenses) {
      if (e.currency === 'USD') {
        rows.push({ id: 'e' + e.id, date: e.date, label: e.description || 'Gasto', amount: e.amountOriginal, sign: -1 });
      }
    }
    for (const x of state.exchanges || []) {
      rows.push({
        id: 'x' + x.id,
        date: x.date,
        label: x.description ? `Compra de dólares · ${x.description}` : 'Compra de dólares',
        amount: x.usd,
        sign: 1,
      });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [open, state]);

  return (
    <>
      <WalletTile color={USD_COLOR} letter="U" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Dólares</p>
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatUsdNum(usd)}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft num">
          {equivalent != null ? <>≈ {formatARS(equivalent)} al blue de hoy</> : 'Ahorro acumulado en dólares'}
        </p>
      </WalletTile>

      <Modal open={open} onClose={() => setOpen(false)} title="Dólares">
        <p className="mb-3 text-sm text-ink-soft num">
          Ahorro acumulado: <span className="font-semibold text-ink">{formatUsdNum(usd)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos en dólares.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">{formatDate(it.date)}</p>
                </div>
                <p className={`shrink-0 text-sm font-semibold num ${it.sign < 0 ? 'text-ink' : 'text-ok'}`}>
                  {it.sign < 0 ? '−' : '+'}{formatUsdNum(Math.abs(it.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function formatUsdNum(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

function LocalBalanceCard({ l, state }) {
  const owed = l.balance > 0;
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === l.groupId)?.color || '#A39D90';

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
      <WalletTile color={color} letter="L" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Local</p>
        <p className={`mt-1.5 font-display text-[1.6rem] font-medium leading-none num ${owed ? 'text-caution' : 'text-ok'}`}>
          {formatARS(Math.abs(l.balance))}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft num">
          {owed ? 'te deben' : l.balance < 0 ? 'repusiste de más' : 'al día'}
        </p>
      </WalletTile>

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
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === e.groupId)?.color || '#A39D90';

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
      <WalletTile color={color} letter="S" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Salidas / gastos extras</p>
        {streak && streak.streak > 0 && (
          <p className="mt-0.5 text-xs font-medium text-ok">
            🔥 {streak.streak} {streak.streak === 1 ? 'día' : 'días'} en verde este mes
          </p>
        )}
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(e.spent)}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft">Gastado este mes · sin presupuesto</p>
      </WalletTile>

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
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === d.groupId)?.color || '#A39D90';

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
      <WalletTile color={color} letter="D" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Día a día</p>
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(d.spent)}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft">Gastado este mes · sin presupuesto</p>
      </WalletTile>

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
