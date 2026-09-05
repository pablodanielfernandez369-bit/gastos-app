import { useMemo, useState } from 'react';
import PeriodFilter from './PeriodFilter';
import ExpenseFormModal from './ExpenseFormModal';
import IncomeFormModal from './IncomeFormModal';
import { formatARS, formatDate, rangeForPeriod, isInRange } from '../lib/format';
import { exportMovementsCsv } from '../lib/csv';
import { todayISO } from '../lib/model';

export default function MovimientosTable({ state, actions }) {
  const [period, setPeriod] = useState('mes');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [groupFilter, setGroupFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ field: 'date', dir: 'desc' });
  const [editing, setEditing] = useState(null); // { kind, id } | null

  const [from, to] = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const groupName = (id) => state.groups.find((g) => g.id === id)?.name;
  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name;

  const movements = useMemo(() => {
    const list = [];
    for (const e of state.expenses) {
      if (!isInRange(e.date, from, to)) continue;
      if (groupFilter !== 'todos' && e.groupId !== groupFilter) continue;
      list.push({ kind: 'gasto', ...e });
    }
    if (groupFilter === 'todos') {
      for (const i of state.incomes) {
        if (!isInRange(i.date, from, to)) continue;
        list.push({ kind: 'ingreso', ...i });
      }
    }
    const filtered = search.trim()
      ? list.filter((m) => m.description.toLowerCase().includes(search.trim().toLowerCase()))
      : list;

    const dir = sort.dir === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.field === 'amount') return (a.amount - b.amount) * dir;
      return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
    });
  }, [state, from, to, groupFilter, search, sort]);

  function toggleSort(field) {
    setSort((s) => (s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }));
  }

  function handleDelete(m) {
    if (!confirm(`¿Borrar "${m.description}" (${formatARS(m.amount)})?`)) return;
    if (m.kind === 'gasto') actions.deleteExpense(m.id);
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
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="todos">Todos</option>
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <input
          className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Buscar descripción…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          onClick={() => exportMovementsCsv(state)}
          className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-600"
        >
          ⬇ CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="cursor-pointer px-3 py-2" onClick={() => toggleSort('date')}>
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
              <tr key={m.kind + m.id} className="border-b border-gray-50 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDate(m.date)}</td>
                <td className="px-3 py-2 text-gray-700">
                  {m.kind === 'ingreso' ? (
                    <span className="text-ok">Ingreso</span>
                  ) : (
                    <>
                      {groupName(m.groupId) || <span className="text-warn">Sin categorizar</span>}
                      {m.subcategoryId && <span className="text-gray-400"> · {subName(m.subcategoryId)}</span>}
                    </>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-700">{m.description}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-medium ${m.kind === 'ingreso' ? 'text-ok' : 'text-gray-900'}`}>
                  {m.kind === 'ingreso' ? '+' : '-'}{formatARS(m.amount)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-gray-400">
                  <button onClick={() => setEditing({ kind: m.kind, id: m.id })} className="px-1">✏️</button>
                  <button onClick={() => handleDelete(m)} className="px-1">🗑️</button>
                </td>
              </tr>
            ))}
            {movements.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Sin movimientos en este período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

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
      {editing?.kind === 'ingreso' && (
        <IncomeFormModal
          open
          onClose={() => setEditing(null)}
          editingId={editing.id}
          draft={toIncomeDraft(state.incomes.find((i) => i.id === editing.id))}
          actions={actions}
        />
      )}
    </div>
  );
}

function toExpenseDraft(e) {
  if (!e) return null;
  return {
    amountRaw: e.currency === 'USD' ? e.amountOriginal : e.amount,
    currency: e.currency,
    groupId: e.groupId,
    subcategoryId: e.subcategoryId,
    description: e.description,
    date: e.date,
    type: e.type,
    fxRate: e.fxRate,
    rawText: null,
  };
}

function toIncomeDraft(i) {
  if (!i) return null;
  return { amountRaw: i.amount, description: i.description, date: i.date, rawText: null };
}
