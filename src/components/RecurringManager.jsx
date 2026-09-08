import { useState } from 'react';
import { newRecurring } from '../lib/model';
import { formatARS } from '../lib/format';

export default function RecurringManager({ state, actions }) {
  const [groupId, setGroupId] = useState(state.groups[0]?.id ?? null);
  const [subcategoryId, setSubcategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(10);

  const subcategories = state.subcategories.filter((s) => s.groupId === groupId);

  function handleAdd() {
    if (!description.trim() || !groupId) return;
    actions.addRecurring(newRecurring({
      groupId,
      subcategoryId: subcategoryId || null,
      description: description.trim(),
      amount: parseFloat(amount) || 0,
      dayOfMonth: Math.min(28, Math.max(1, Number(dayOfMonth) || 1)),
    }));
    setDescription('');
    setAmount('');
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Gastos recurrentes</h3>
      <p className="mb-3 text-sm text-gray-500">
        Te los recordamos en el dashboard a partir del día que elijas, hasta que los cargues ese mes.
      </p>

      <ul className="mb-3 space-y-2">
        {state.recurring.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span>
              {r.description} · día {r.dayOfMonth} · {formatARS(r.amount)}
            </span>
            <button onClick={() => actions.deleteRecurring(r.id)} className="text-gray-400">🗑️</button>
          </li>
        ))}
        {state.recurring.length === 0 && (
          <li className="text-sm text-gray-400">No tenés recordatorios configurados.</li>
        )}
      </ul>

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <div className="flex gap-2">
          <select
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={groupId ?? ''}
            onChange={(e) => { setGroupId(e.target.value); setSubcategoryId(''); }}
          >
            {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
          >
            <option value="">Sin subcategoría</option>
            {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <input
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Descripción (ej: Alquiler)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            type="number"
            className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Monto estimado"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={28}
            className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            placeholder="Día"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </div>
        <button
          onClick={handleAdd}
          className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white"
        >
          + Agregar recordatorio
        </button>
      </div>
    </div>
  );
}
