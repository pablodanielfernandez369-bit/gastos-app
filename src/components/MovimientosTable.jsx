import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import ExpenseFormModal from './ExpenseFormModal';
import IncomeFormModal from './IncomeFormModal';
import ExchangeFormModal from './ExchangeFormModal';
import { formatARS, formatDate, rangeForPeriod, isInRange } from '../lib/format';
import { exportMovementsCsv } from '../lib/csv';
import { todayISO, USD_COLOR } from '../lib/model';
import MonoChip from './MonoChip';

export default function MovimientosTable({ state, actions }) {
  const [period, setPeriod] = useState('mes');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [groupFilter, setGroupFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [sort, setSort] = useState({ field: 'date', dir: 'desc' });
  const [editing, setEditing] = useState(null); // { kind, id } | null

  const [from, to] = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const groupName = (id) => state.groups.find((g) => g.id === id)?.name;
  const groupColor = (id) => state.groups.find((g) => g.id === id)?.color || '#A39D90';
  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name;

  const { movementsArs, movementsUsd } = useMemo(() => {
    const list = [];
    for (const e of state.expenses) {
      if (!isInRange(e.date, from, to)) continue;
      if (groupFilter !== 'todos' && e.groupId !== groupFilter) continue;
      list.push({
        kind: 'gasto',
        ...e,
        nativeAmount: e.currency === 'USD' ? e.amountOriginal : e.amount,
      });
    }
    if (groupFilter === 'todos') {
      for (const i of state.incomes) {
        if (!isInRange(i.date, from, to)) continue;
        list.push({
          kind: 'ingreso',
          ...i,
          nativeAmount: i.currency === 'USD' ? i.amountOriginal : i.amount,
        });
      }
      // Una compra de USD aparece en las dos listas: sale en pesos, entra en
      // dólares. Una venta es al revés: entra en pesos, sale en dólares.
      for (const x of state.exchanges || []) {
        if (!isInRange(x.date, from, to)) continue;
        const isVenta = x.kind === 'venta';
        const verbo = isVenta ? 'Venta' : 'Compra';
        const description = `${verbo} US$ ${x.usd} a ${formatARS(x.rate)}${x.description ? ' · ' + x.description : ''}`;
        list.push({ kind: 'cambio', xKind: x.kind, id: x.id, date: x.date, description, currency: 'ARS', nativeAmount: x.ars });
        list.push({ kind: 'cambio', xKind: x.kind, id: x.id, date: x.date, description, currency: 'USD', nativeAmount: x.usd });
      }
    }
    const q = search.trim().toLowerCase();
    const min = parseFloat(minAmount);
    const max = parseFloat(maxAmount);
    const filtered = list.filter((m) => {
      if (Number.isFinite(min) && m.nativeAmount < min) return false;
      if (Number.isFinite(max) && m.nativeAmount > max) return false;
      if (!q) return true;
      const haystack = [
        m.description,
        m.personName,
        groupName(m.groupId),
        subName(m.subcategoryId),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    const sorted = filtered.sort((a, b) => {
      if (sort.field === 'amount') return (a.nativeAmount - b.nativeAmount) * dir;
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
    });

    return {
      movementsArs: sorted.filter((m) => m.currency !== 'USD'),
      movementsUsd: sorted.filter((m) => m.currency === 'USD'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, from, to, groupFilter, search, minAmount, maxAmount, sort]);

  function toggleSort(field) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));
  }

  function handleDelete(m) {
    const label = m.currency === 'USD' ? formatUsd(m.nativeAmount) : formatARS(m.nativeAmount);
    if (!confirm(`¿Borrar "${m.description}" (${label})?`)) return;
    if (m.kind === 'gasto') actions.deleteExpense(m.id);
    else if (m.kind === 'cambio') actions.deleteExchange(m.id);
    else actions.deleteIncome(m.id);
  }

  return (
    <div className="space-y-3">
      <PeriodFilter
        period={period}
        setPeriod={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
      />

      <div className="flex gap-2">
        <select
          className="rounded-lg border border-hair px-2 py-1.5 text-sm"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="todos">Todos</option>
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <input
          className="flex-1 rounded-lg border border-hair px-2 py-1.5 text-sm"
          placeholder="Buscar (descripción, categoría, nombre)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => exportMovementsCsv(state)}
          className="shrink-0 rounded-lg border border-hair px-2.5 py-1.5 text-sm text-ink-soft"
        >
          ⬇ CSV
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-faint">Monto</span>
        <input
          type="number"
          inputMode="numeric"
          className="w-full rounded-lg border border-hair px-2 py-1.5"
          placeholder="mín"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
        />
        <span className="text-ink-faint">–</span>
        <input
          type="number"
          inputMode="numeric"
          className="w-full rounded-lg border border-hair px-2 py-1.5"
          placeholder="máx"
          value={maxAmount}
          onChange={(e) => setMaxAmount(e.target.value)}
        />
      </div>

      <div>
        <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          Movimientos en pesos
        </p>
        <MovementsList
          movements={movementsArs}
          sort={sort}
          toggleSort={toggleSort}
          groupName={groupName}
          groupColor={groupColor}
          subName={subName}
          formatAmount={formatARS}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      </div>

      {movementsUsd.length > 0 && (
        <div>
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Movimientos en dólares
          </p>
          <MovementsList
            movements={movementsUsd}
            sort={sort}
            toggleSort={toggleSort}
            groupName={groupName}
            groupColor={groupColor}
            subName={subName}
            formatAmount={formatUsd}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
        </div>
      )}

      {editing?.kind === 'gasto' && (
        <ExpenseFormModal
          open
          onClose={() => setEditing(null)}
          editingId={editing.id}
          draft={toExpenseDraft(state.expenses.find((e) => e.id === editing.id))}
          state={state}
          actions={actions}
        />
      )}
      {editing?.kind === 'cambio' && (
        <ExchangeFormModal
          open
          onClose={() => setEditing(null)}
          editingId={editing.id}
          draft={(state.exchanges || []).find((x) => x.id === editing.id)}
          actions={actions}
        />
      )}
      {editing?.kind === 'ingreso' && (
        <IncomeFormModal
          open
          onClose={() => setEditing(null)}
          editingId={editing.id}
          draft={toIncomeDraft(state.incomes.find((i) => i.id === editing.id))}
          state={state}
          actions={actions}
        />
      )}
    </div>
  );
}

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

function MovementsList({ movements, sort, toggleSort, groupName, groupColor, subName, formatAmount, onEdit, onDelete }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-hair bg-surface">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-hair bg-surface-2 text-left text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">
            <th className="cursor-pointer px-3 py-2.5" onClick={() => toggleSort('date')}>
              Fecha {sort.field === 'date' && (sort.dir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="px-3 py-2">Categoría</th>
            <th className="px-3 py-2">Descripción</th>
            <th className="cursor-pointer px-3 py-2 text-right" onClick={() => toggleSort('amount')}>
              Monto {sort.field === 'amount' && (sort.dir === 'asc' ? '↑' : '↓')}
            </th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.kind + m.id + m.currency} className="border-b border-hair last:border-0">
              <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{formatDate(m.date)}</td>
              <td className="px-3 py-2 text-ink">
                <div className="flex items-center gap-2">
                  {m.kind === 'ingreso' ? (
                    <>
                      <MonoChip color="#5A7D2A" letter="$" size={22} />
                      <span className="text-ok">Ingreso</span>
                    </>
                  ) : m.kind === 'cambio' ? (
                    <>
                      <MonoChip color={USD_COLOR} letter="U" size={22} />
                      <span className="text-ink-soft">{m.xKind === 'venta' ? 'Venta USD' : 'Compra USD'}</span>
                    </>
                  ) : m.groupId ? (
                    <>
                      <MonoChip color={groupColor(m.groupId)} letter={groupName(m.groupId)?.charAt(0).toUpperCase()} size={22} />
                      <span>
                        {groupName(m.groupId)}
                        {m.subcategoryId && <span className="text-ink-faint"> · {subName(m.subcategoryId)}</span>}
                      </span>
                    </>
                  ) : (
                    <span className="text-warn">Sin categorizar</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-ink">
                {m.description}
                {m.personName && (
                  <span className="ml-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {m.personName}
                  </span>
                )}
              </td>
              <td className={`whitespace-nowrap px-3 py-2 text-right font-numeral font-semibold num ${isPlus(m) ? 'text-ok' : 'text-ink'}`}>
                {isPlus(m) ? '+' : '-'}{formatAmount(m.nativeAmount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-ink-faint">
                <button onClick={() => onEdit({ kind: m.kind, id: m.id })} className="px-1">✏️</button>
                <button onClick={() => onDelete(m)} className="px-1">🗑️</button>
              </td>
            </tr>
          ))}
          {movements.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-6 text-center text-ink-faint">Sin movimientos en este período.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Ingresos y la pata en dólares de una compra de USD suman (entran dólares,
// salen pesos); en una venta es al revés (entran pesos, salen dólares).
function isPlus(m) {
  if (m.kind === 'ingreso') return true;
  if (m.kind === 'cambio') {
    return m.xKind === 'venta' ? m.currency === 'ARS' : m.currency === 'USD';
  }
  return false;
}

function toExpenseDraft(e) {
  if (!e) return null;
  return {
    amountRaw: e.currency === 'USD' ? e.amountOriginal : e.amount,
    currency: e.currency,
    groupId: e.groupId,
    subcategoryId: e.subcategoryId,
    description: e.description,
    personName: e.personName,
    date: e.date,
    type: e.type,
    fxRate: e.fxRate,
    rawText: null,
  };
}

function toIncomeDraft(i) {
  if (!i) return null;
  return {
    amountRaw: i.currency === 'USD' ? i.amountOriginal : i.amount,
    currency: i.currency,
    description: i.description,
    date: i.date,
    fxRate: i.fxRate,
    groupId: i.groupId,
    personName: i.personName,
    rawText: null,
  };
}
