import { useMemo, useState } from 'react';
import { pendingRecurring } from '../lib/recurring';
import { formatARS, monthKey } from '../lib/format';
import { todayISO } from '../lib/model';
import ExpenseFormModal from './ExpenseFormModal';

export default function RecurringReminders({ state, actions }) {
  const pending = useMemo(() => pendingRecurring(state), [state]);
  const [loading, setLoading] = useState(null); // recurring item being cargado

  if (pending.length === 0) return null;

  return (
    <div className="rounded-2xl border border-caution/40 bg-caution/5 p-4">
      <p className="mb-2.5 font-display text-[0.9rem] font-medium text-ink">
        Gastos recurrentes pendientes de este mes
      </p>
      <ul className="space-y-2">
        {pending.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-ink num">
            <span>{r.description} · {formatARS(r.amount)}</span>
            <span className="flex shrink-0 gap-1.5">
              <button
                onClick={() => actions.dismissRecurringForMonth(r.id, monthKey(todayISO()))}
                className="rounded-full border border-hair px-2.5 py-1 text-xs font-medium text-ink-soft"
              >
                Ya lo cargué
              </button>
              <button
                onClick={() => setLoading(r)}
                className="rounded-full bg-caution px-3 py-1 text-xs font-semibold text-paper"
              >
                Cargar ahora
              </button>
            </span>
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
