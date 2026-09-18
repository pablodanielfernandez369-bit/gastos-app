import { useMemo } from 'react';
import { formatARS } from '../lib/format';
import { computeMonthBudget } from '../lib/selectors';
import { useDolar } from '../lib/useDolar';

// Metas del mes: cuánto querés ahorrar y cuánto podés gastar en salidas.
export default function GoalsManager({ state, actions }) {
  const cfg = state.config || {};
  const b = useMemo(() => computeMonthBudget(state), [state]);
  const dolar = useDolar();

  return (
    <div className="space-y-4 rounded-2xl border border-hair bg-surface p-4">
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
        <label className="mb-1 block text-xs font-medium text-ink-soft">
          Qué categoría cuenta como “extras”
        </label>
        <select
          className="w-full rounded-lg border border-hair px-3 py-2"
          value={cfg.extrasGroupId ?? ''}
          onChange={(e) => actions.setExtrasGroupId(e.target.value || null)}
        >
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-faint">
          Todo lo que cargues en esta categoría cuenta contra el presupuesto de extras.
        </p>
      </div>

      <MoneyField
        label="Presupuesto de vivienda"
        value={cfg.viviendaBudget}
        onChange={actions.setViviendaBudget}
        placeholder="400000"
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">
          Qué categoría cuenta como “vivienda”
        </label>
        <select
          className="w-full rounded-lg border border-hair px-3 py-2"
          value={cfg.viviendaGroupId ?? ''}
          onChange={(e) => actions.setViviendaGroupId(e.target.value || null)}
        >
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-faint">
          Destiná un capital fijo para alquiler, expensas y servicios, y avisamos si te pasás.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-ink-soft">
          Cotización del dólar (para ver tus ahorros en USD)
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-hair px-3">
          <span className="text-ink-faint">$</span>
          <input
            type="number"
            inputMode="numeric"
            className="w-full border-0 py-2 focus:outline-none focus:ring-0"
            value={cfg.fxRateManual ?? ''}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              actions.setFxRateManual(Number.isFinite(n) && n > 0 ? n : null);
            }}
            placeholder={dolar?.promedio ? `blue hoy: ${dolar.promedio}` : 'ej: 1450'}
          />
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {cfg.fxRateManual
            ? 'Usando la cotización que fijaste. Borrá el número para volver al blue automático.'
            : dolar?.promedio
              ? `Automático: dólar blue $${dolar.promedio} (promedio compra/venta, ${dolar.fuente || 'dolarhoy'}).`
              : 'Se toma el dólar blue automáticamente cuando haya conexión.'}
        </p>
      </div>

      {b.incomeTotal > 0 && cfg.savingsGoal != null && (
        <p className="text-xs text-ink-soft">
          Con {formatARS(b.incomeTotal)} de ingreso este mes, después de ahorrar{' '}
          {formatARS(cfg.savingsGoal)} te quedan{' '}
          <strong className="text-ink">{formatARS(b.incomeTotal - cfg.savingsGoal)}</strong> para gastos.
        </p>
      )}
      {b.coherence && !b.coherence.fits && (
        <p className="text-xs text-warn">
          Ojo: lo que ya gastaste este mes + tu meta de ahorro + el presupuesto de salidas
          suman {formatARS(b.coherence.gap)} más que tu ingreso.
        </p>
      )}
    </div>
  );
}

function MoneyField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <div className="flex items-center gap-2 rounded-lg border border-hair px-3">
        <span className="text-ink-faint">$</span>
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
