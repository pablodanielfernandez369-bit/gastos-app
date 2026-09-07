import { useMemo } from 'react';
import { formatARS } from '../lib/format';
import { computeMonthBudget } from '../lib/selectors';

// Metas del mes: cuánto querés ahorrar y cuánto podés gastar en salidas.
export default function GoalsManager({ state, actions }) {
  const cfg = state.config || {};
  const b = useMemo(() => computeMonthBudget(state), [state]);

  return (
    <div className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
      <MoneyField
        label="Meta de ahorro mensual"
        value={cfg.savingsGoal}
        onChange={actions.setSavingsGoal}
        placeholder="300000"
      />
      <MoneyField
        label="Presupuesto de gastos extras / salidas"
        value={cfg.extrasBudget}
        onChange={actions.setExtrasBudget}
        placeholder="150000"
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          Qué categoría cuenta como “extras”
        </label>
        <select
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          value={cfg.extrasGroupId ?? ''}
          onChange={(e) => actions.setExtrasGroupId(e.target.value || null)}
        >
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-400">
          Todo lo que cargues en esta categoría cuenta contra el presupuesto de extras.
        </p>
      </div>

      {b.incomeTotal > 0 && cfg.savingsGoal != null && (
        <p className="text-xs text-gray-500">
          Con {formatARS(b.incomeTotal)} de ingreso este mes, después de ahorrar{' '}
          {formatARS(cfg.savingsGoal)} te quedan{' '}
          <strong className="text-gray-700">{formatARS(b.incomeTotal - cfg.savingsGoal)}</strong> para gastos.
        </p>
      )}
      {b.coherence && !b.coherence.fits && (
        <p className="text-xs text-warn">
          Ojo: meta de ahorro + gastos fijos + presupuesto de extras suman {formatARS(b.coherence.gap)}{' '}
          más que tu ingreso del mes.
        </p>
      )}
    </div>
  );
}

function MoneyField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3">
        <span className="text-gray-400">$</span>
        <input
          type="number"
          inputMode="numeric"
          className="w-full border-0 py-2 focus:outline-none focus:ring-0"
          value={value ?? ''}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) && n > 0 ? n : null);
          }}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
