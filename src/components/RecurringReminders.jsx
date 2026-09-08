import { useMemo, useState } from 'react';
import { pendingRecurring } from '../lib/recurring';
import { formatARS } from '../lib/format';
import { todayISO } from '../lib/model';
import ExpenseFormModal from './ExpenseFormModal';

export default function RecurringReminders({ state, actions }) {
  const pending = useMemo(() => pendingRecurring(state), [state]);
  const [loading, setLoading] = useState(null); // recurring item being cargado

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-2 text-sm font-semibold text-amber-800">
        Gastos recurrentes pendientes de este mes
      </p>
      <ul className="space-y-2">
        {pending.map((r) => (
          <li key={r.id} className="flex items-center justify-between text-sm text-amber-900">
            <span>{r.description} · {formatARS(r.amount)}</span>
            <button
              onClick={() => setLoading(r)}
              className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white"
            >
              Cargar ahora
            </button>
          </li>
        ))}
      </ul>

      {loading && (
        <ExpenseFormModal
          open
          onClose={() => setLoading(null)}
          state={state}
          actions={actions}
          draft={{
            amountRaw: loading.amount || '',
            currency: 'ARS',
            groupId: loading.groupId,
            subcategoryId: loading.subcategoryId,
            description: loading.description,
            date: todayISO(),
            type: 'variable',
            recurringId: loading.id,
            rawText: null,
          }}
        />
      )}
    </div>
  );
}
