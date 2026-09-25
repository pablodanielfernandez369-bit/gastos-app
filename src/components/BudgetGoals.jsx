import { useMemo, useState } from 'react';
import { computeMonthBudget, computeStreak, computeLocalBalance, computeTotals, normalizePersonKey } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';
import { useDolar, usdRate } from '../lib/useDolar';
import { USD_COLOR } from '../lib/model';
import Modal from './Modal';
import MonoChip from './MonoChip';
import PrestamoLoanModal from './PrestamoLoanModal';
import PrestamoReembolsoModal from './PrestamoReembolsoModal';
import DebtSettlementModal from './DebtSettlementModal';

// La tarjeta de cada billetera: un chip con la inicial + un degradé muy
// suave del color de esa categoría de fondo. El mismo color (y el mismo
// chip) se usa en Movimientos/Reportes/Categorías, así que la billetera
// queda coherente con el resto de la app.
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
      <MonoChip color={color} letter={letter} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const STATUS = {
  verde: { bar: 'bg-ok', text: 'text-ok' },
  amarillo: { bar: 'bg-caution', text: 'text-caution' },
  rojo: { bar: 'bg-warn', text: 'text-warn' },
};
function toPct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}
function clampPct(x) {
  return Math.max(0, Math.min(100, (x || 0) * 100));
}

// Vivienda, Día a día, Salidas y Familia pueden tener un presupuesto
// puesto en Ajustes → Metas del mes (opcional) — si lo tienen, se ve el %
// y la barra; si no, solo "gastado este mes", como antes.
function BudgetProgress({ b }) {
  if (!b.budget) {
    return <p className="mt-2.5 text-xs text-ink-soft">Gastado este mes · sin presupuesto</p>;
  }
  const st = STATUS[b.status] || STATUS.verde;
  return (
    <>
      <p className="mt-1 text-xs text-ink-soft">
        de {formatARS(b.budget)} · <span className={`font-semibold ${st.text}`}>{toPct(b.pct)}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(b.pct)}%` }} />
      </div>
    </>
  );
}

// Las billeteras: Vivienda, Día a día, Salidas/Ocio, Familia, Dólares y
// Préstamo, todas ancho completo (una debajo de otra) — solo el nombre, el
// gastado del mes (o el saldo, según la billetera), el % y la barra si
// tiene presupuesto puesto, y el detalle de movimientos al tocarla.
export default function BudgetGoals({ state, actions, now = new Date() }) {
  const b = useMemo(() => computeMonthBudget(state, now), [state, now]);
  const streak = useMemo(() => computeStreak(state, now), [state, now]);
  const local = useMemo(() => computeLocalBalance(state), [state]);
  const hasLocalActivity = Boolean(local && (local.spent > 0 || local.reimbursed > 0 || local.settled > 0));
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
        {b.vivienda && <ViviendaCard v={b.vivienda} state={state} now={now} />}
        {b.diaADia && <DiaADiaCard d={b.diaADia} state={state} now={now} />}
        {b.extras && <ExtrasCard e={b.extras} streak={streak} state={state} now={now} />}
        {b.familia && <FamiliaCard f={b.familia} state={state} now={now} />}
        {b.tarjetas && <TarjetasCard t={b.tarjetas} state={state} now={now} />}
        <DolaresCard
          usd={allTime.savingsByCurrency.usd + (allTime.swaps?.usd || 0) - (allTime.autoDeducted?.usd || 0)}
          rate={usdToArs}
          state={state}
        />
        {hasLocalActivity && <PrestamoCard l={local} state={state} actions={actions} />}
      </div>
    </div>
  );
}

function FamiliaCard({ f, state, now }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === f.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(now.toISOString());
    return state.expenses
      .filter((ex) => monthKey(ex.date) === currKey && ex.groupId === f.groupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((ex) => ({
        id: ex.id,
        date: ex.date,
        label: ex.description || state.subcategories.find((s) => s.id === ex.subcategoryId)?.name || 'Familia',
        sub: ex.description ? state.subcategories.find((s) => s.id === ex.subcategoryId)?.name : null,
        amount: ex.currency === 'USD' ? ex.amountOriginal : ex.amount,
        usd: ex.currency === 'USD',
      }));
  }, [open, state, f.groupId, now]);

  return (
    <>
      <WalletTile color={color} letter="F" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Familia</p>
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(f.spent)}
        </p>
        <BudgetProgress b={f} />
      </WalletTile>

      <Modal open={open} onClose={() => setOpen(false)} title="Familia">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(f.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <MonoChip color={color} letter={it.label.charAt(0).toUpperCase()} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-numeral text-sm font-semibold text-ink num">
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

function TarjetasCard({ t, state, now }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === t.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(now.toISOString());
    return state.expenses
      .filter((ex) => monthKey(ex.date) === currKey && ex.groupId === t.groupId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((ex) => ({
        id: ex.id,
        date: ex.date,
        label: ex.description || state.subcategories.find((s) => s.id === ex.subcategoryId)?.name || 'Tarjetas',
        sub: ex.description ? state.subcategories.find((s) => s.id === ex.subcategoryId)?.name : null,
        amount: ex.currency === 'USD' ? ex.amountOriginal : ex.amount,
        usd: ex.currency === 'USD',
      }));
  }, [open, state, t.groupId, now]);

  return (
    <>
      <WalletTile color={color} letter="T" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Tarjetas</p>
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(t.spent)}
        </p>
        <BudgetProgress b={t} />
      </WalletTile>

      <Modal open={open} onClose={() => setOpen(false)} title="Tarjetas">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(t.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <MonoChip color={color} letter={it.label.charAt(0).toUpperCase()} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-numeral text-sm font-semibold text-ink num">
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

function ViviendaCard({ v, state, now }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === v.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(now.toISOString());
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
  }, [open, state, v.groupId, now]);

  return (
    <>
      <WalletTile color={color} letter="V" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Vivienda</p>
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(v.spent)}
        </p>
        <BudgetProgress b={v} />
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
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <MonoChip color={color} letter={it.label.charAt(0).toUpperCase()} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-numeral text-sm font-semibold text-ink num">
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
        rows.push({ id: 'i' + i.id, date: i.date, label: i.description || 'Ingreso', amount: i.amountOriginal, sign: 1, kind: 'ingreso' });
      }
    }
    for (const e of state.expenses) {
      if (e.currency === 'USD') {
        rows.push({ id: 'e' + e.id, date: e.date, label: e.description || 'Gasto', amount: e.amountOriginal, sign: -1, kind: 'gasto' });
      }
    }
    for (const x of state.exchanges || []) {
      rows.push({
        id: 'x' + x.id,
        date: x.date,
        label: x.description ? `Compra de dólares · ${x.description}` : 'Compra de dólares',
        amount: x.usd,
        sign: 1,
        kind: 'compra',
      });
    }
    for (const d of state.autoDeductions || []) {
      rows.push({
        id: 'd' + d.id,
        date: d.date,
        label: d.note || `Descuento automático (gastaste ${formatARS(d.ars)} de más)`,
        amount: d.usd,
        sign: -1,
        kind: 'descuento',
      });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [open, state]);

  return (
    <>
      <WalletTile color={USD_COLOR} letter="U" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Dólares</p>
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
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
            {items.map((it) => {
              const chip =
                it.kind === 'ingreso'
                  ? { color: '#5A7D2A', letter: '$' }
                  : it.kind === 'compra'
                    ? { color: USD_COLOR, letter: 'U' }
                    : it.kind === 'descuento'
                      ? { color: '#A23B2B', letter: '−' }
                      : { color: '#A39D90', letter: it.label.charAt(0).toUpperCase() };
              return (
                <li key={it.id} className="flex items-center gap-3 py-2.5">
                  <MonoChip color={chip.color} letter={chip.letter} size={26} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                    <p className="text-xs text-ink-faint">{formatDate(it.date)}</p>
                  </div>
                  <p className={`shrink-0 font-numeral text-sm font-semibold num ${it.sign < 0 ? 'text-ink' : 'text-ok'}`}>
                    {it.sign < 0 ? '−' : '+'}{formatUsdNum(Math.abs(it.amount))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </>
  );
}

function formatUsdNum(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

// "Préstamo": plata que se le da a alguien esperando que la devuelva.
// "Local" (el negocio de Pablo) es una persona más ahí adentro, no un caso
// aparte. Tres niveles: la tarjeta (saldo total), la lista de personas al
// tocarla, y el detalle de una persona con su historial + las 3 acciones
// (prestar, reponer en efectivo, o saldar sin plata de por medio).
function PrestamoCard({ l, state, actions }) {
  const [open, setOpen] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [showExpense, setShowExpense] = useState(false);
  const [showIncome, setShowIncome] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const owed = l.balance > 0;
  const color = state.groups.find((g) => g.id === l.groupId)?.color || '#A39D90';
  const owedCount = l.people.filter((p) => p.balance > 0).length;

  function closeAll() {
    setOpen(false);
    setSelectedPerson(null);
  }

  const items = useMemo(() => {
    if (!selectedPerson) return [];
    const key = normalizePersonKey(selectedPerson);
    const gastos = state.expenses
      .filter((e) => e.groupId === l.groupId && normalizePersonKey(e.personName) === key)
      .map((e) => ({ id: 'e' + e.id, date: e.date, label: e.description || 'Préstamo', amount: -e.amount }));
    const reembolsos = state.incomes
      .filter((i) => i.groupId === l.groupId && normalizePersonKey(i.personName) === key)
      .map((i) => ({ id: 'i' + i.id, date: i.date, label: i.description || 'Reembolso', amount: i.amount }));
    const saldos = (state.debtSettlements || [])
      .filter((s) => normalizePersonKey(s.personName) === key)
      .map((s) => ({
        id: 's' + s.id,
        date: s.date,
        label: s.description ? `Saldado de otra forma · ${s.description}` : 'Saldado de otra forma',
        amount: s.amount,
        settled: true,
      }));
    return [...gastos, ...reembolsos, ...saldos].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [selectedPerson, state, l.groupId]);

  const selectedBalance = selectedPerson ? l.people.find((p) => p.personName === selectedPerson)?.balance ?? 0 : 0;

  return (
    <>
      <WalletTile color={color} letter="P" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Préstamo</p>
        <p className={`mt-1.5 font-numeral text-[1.6rem] font-medium leading-none num ${owed ? 'text-caution' : 'text-ok'}`}>
          {formatARS(Math.abs(l.balance))}
        </p>
        <p className="mt-2.5 text-xs text-ink-soft num">
          {owed
            ? `te deben, entre ${owedCount} persona${owedCount === 1 ? '' : 's'}`
            : l.balance < 0 ? 'repusiste de más' : 'al día'}
        </p>
      </WalletTile>

      <Modal open={open} onClose={closeAll} title={selectedPerson || 'Préstamo'}>
        {!selectedPerson ? (
          <>
            <p className="mb-3 text-sm text-ink-soft num">
              Te deben en total: <span className="font-semibold text-ink">{formatARS(Math.max(0, l.balance))}</span>
            </p>
            {l.people.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-faint">Sin préstamos todavía.</p>
            ) : (
              <ul className="divide-y divide-hair">
                {l.people.map((p) => (
                  <li key={p.personName}>
                    <button
                      type="button"
                      onClick={() => setSelectedPerson(p.personName)}
                      className="flex w-full items-center gap-3 py-2.5 text-left"
                    >
                      <MonoChip color={color} letter={p.personName.charAt(0).toUpperCase()} size={26} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{p.personName}</p>
                        <p className="text-xs text-ink-faint">
                          {p.balance > 0
                            ? 'te debe'
                            : p.settled > 0
                              ? 'saldado de otra forma'
                              : p.reimbursed > 0
                                ? 'te repuso'
                                : 'al día'}
                        </p>
                      </div>
                      <p className={`shrink-0 font-numeral text-sm font-semibold num ${p.balance > 0 ? 'text-caution' : 'text-ok'}`}>
                        {formatARS(Math.abs(p.balance))}
                      </p>
                      <span className="text-ink-faint">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowExpense(true)}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-paper"
              >
                + Presté
              </button>
              <button
                onClick={() => setShowIncome(true)}
                className="flex-1 rounded-lg border border-ok/25 bg-ok/10 py-2.5 text-sm font-medium text-ok"
              >
                + Me repusieron
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedPerson(null)}
              className="mb-2 text-sm font-medium text-accent"
            >
              ‹ Préstamo
            </button>
            <p className="mb-3 text-sm text-ink-soft num">
              {selectedBalance > 0 ? 'Te debe' : 'Balance'}:{' '}
              <span className="font-semibold text-ink">{formatARS(Math.abs(selectedBalance))}</span>
            </p>
            {items.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos.</p>
            ) : (
              <ul className="divide-y divide-hair">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-2.5">
                    <MonoChip
                      color={it.settled ? '#A39D90' : it.amount < 0 ? color : '#5A7D2A'}
                      letter={it.settled ? '✓' : it.amount < 0 ? 'P' : '$'}
                      size={26}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                      <p className="text-xs text-ink-faint">{formatDate(it.date)}</p>
                    </div>
                    <p className={`shrink-0 font-numeral text-sm font-semibold num ${it.amount < 0 ? 'text-ink' : it.settled ? 'text-ink-faint' : 'text-ok'}`}>
                      {it.amount < 0 ? '−' : '+'}{formatARS(Math.abs(it.amount))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowExpense(true)}
                className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-paper"
              >
                + Presté
              </button>
              <button
                onClick={() => setShowIncome(true)}
                className="flex-1 rounded-lg border border-ok/25 bg-ok/10 py-2.5 text-sm font-medium text-ok"
              >
                + Efectivo
              </button>
            </div>
            <button
              onClick={() => setShowSettle(true)}
              className="mt-2 w-full rounded-lg border border-dashed border-hair py-2.5 text-xs font-medium text-ink-soft"
            >
              ✓ Lo saldó de otra forma
            </button>
          </>
        )}
      </Modal>

      {showExpense && (
        <PrestamoLoanModal
          open
          onClose={() => setShowExpense(false)}
          groupId={l.groupId}
          personName={selectedPerson}
          knownPeople={l.people.map((p) => p.personName)}
          actions={actions}
        />
      )}
      {showIncome && (
        <PrestamoReembolsoModal
          open
          onClose={() => setShowIncome(false)}
          groupId={l.groupId}
          personName={selectedPerson}
          knownPeople={l.people.map((p) => p.personName)}
          actions={actions}
        />
      )}
      {showSettle && selectedPerson && (
        <DebtSettlementModal
          open
          onClose={() => setShowSettle(false)}
          personName={selectedPerson}
          maxAmount={Math.max(0, selectedBalance)}
          actions={actions}
        />
      )}
    </>
  );
}

function ExtrasCard({ e, streak, state, now }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === e.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(now.toISOString());
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
  }, [open, state, now]);

  return (
    <>
      <WalletTile color={color} letter="S" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Salidas / gastos extras</p>
        {streak && streak.streak > 0 && (
          <p className="mt-0.5 text-xs font-medium text-ok">
            🔥 {streak.streak} {streak.streak === 1 ? 'día' : 'días'} en verde este mes
          </p>
        )}
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(e.spent)}
        </p>
        <BudgetProgress b={e} />
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
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <MonoChip color={color} letter={it.label.charAt(0).toUpperCase()} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-numeral text-sm font-semibold text-ink num">{formatARS(it.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function DiaADiaCard({ d, state, now }) {
  const [open, setOpen] = useState(false);
  const color = state.groups.find((g) => g.id === d.groupId)?.color || '#A39D90';

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(now.toISOString());
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
  }, [open, state, now]);

  return (
    <>
      <WalletTile color={color} letter="D" onClick={() => setOpen(true)}>
        <p className="font-display text-[0.95rem] font-medium text-ink">Día a día</p>
        <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(d.spent)}
        </p>
        <BudgetProgress b={d} />
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
              <li key={it.id} className="flex items-center gap-3 py-2.5">
                <MonoChip color={color} letter={it.label.charAt(0).toUpperCase()} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 font-numeral text-sm font-semibold text-ink num">{formatARS(it.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
