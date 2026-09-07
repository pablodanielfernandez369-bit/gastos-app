import { useMemo } from 'react';
import { computeMonthBudget } from '../lib/selectors';
import { formatARS } from '../lib/format';

// Semáforo del presupuesto de extras del mes en curso + estado de la meta de
// ahorro. Siempre usa el mes calendario actual, sin importar el filtro de
// período del dashboard (las metas son mensuales).
const STATUS = {
  verde: { bar: 'bg-ok', text: 'text-ok', box: 'border-gray-200 bg-white' },
  amarillo: { bar: 'bg-caution', text: 'text-caution', box: 'border-amber-300 bg-amber-50' },
  rojo: { bar: 'bg-warn', text: 'text-warn', box: 'border-red-300 bg-red-50' },
};

export default function BudgetGoals({ state }) {
  const b = useMemo(() => computeMonthBudget(state), [state]);

  if (!b.hasAnyGoal) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        Definí tu <strong>meta de ahorro</strong> y tu <strong>presupuesto de salidas</strong> del mes
        en Ajustes&nbsp;⚙️ para ver acá cómo venís.
      </div>
    );
  }

  const alerts = [];
  if (b.extras && b.extras.status === 'rojo') {
    alerts.push(
      b.extras.spent >= b.extras.budget
        ? `Te pasaste del presupuesto de salidas: ${formatARS(b.extras.spent)} de ${formatARS(b.extras.budget)}.`
        : `Si seguís a este ritmo terminás el mes en ${formatARS(b.extras.projected)} de salidas (${toPct(b.extras.projectedPct)} del presupuesto).`
    );
  } else if (b.extras && b.extras.status === 'amarillo') {
    alerts.push(`Ojo con las salidas: llevás ${toPct(b.extras.pct)} del presupuesto y quedan ${b.extras.daysLeft} días.`);
  }
  if (b.savings && !b.savings.onTrack) {
    alerts.push(`A este ritmo vas a ahorrar ${formatARS(Math.max(0, b.savings.projected))}, por debajo de tu meta de ${formatARS(b.savings.goal)}.`);
  }
  if (b.coherence && !b.coherence.fits) {
    alerts.push(`Los números no cierran: para cumplir la meta y el presupuesto te faltan ${formatARS(b.coherence.gap)} de ingreso este mes.`);
  }

  const anyRed = (b.extras && b.extras.status === 'rojo') || (b.coherence && !b.coherence.fits) || (b.savings && !b.savings.onTrack && b.projReliable && b.savings.projected < 0);

  return (
    <div className="space-y-3">
      {alerts.length > 0 && (
        <div className={`rounded-xl border p-4 text-sm ${anyRed ? 'border-red-300 bg-red-50 text-warn' : 'border-amber-300 bg-amber-50 text-caution'}`}>
          <ul className="space-y-1">
            {alerts.map((a, i) => (
              <li key={i}>⚠️ {a}</li>
            ))}
          </ul>
        </div>
      )}

      {b.savings && <SavingsCard s={b.savings} reliable={b.projReliable} />}
      {b.extras && <ExtrasCard e={b.extras} />}
    </div>
  );
}

function SavingsCard({ s, reliable }) {
  const bankedOk = s.current >= s.goal; // lo que ya llevás ahorrado este mes
  const barColor = bankedOk || s.onTrack ? 'bg-ok' : 'bg-warn';
  const pctColor = bankedOk || s.onTrack ? 'text-ok' : 'text-warn';
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-700">Meta de ahorro del mes</p>
        <p className={`text-sm font-medium ${pctColor}`}>{toPct(s.pct)}</p>
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {formatARS(s.current)}{' '}
        <span className="text-base font-normal text-gray-400">de {formatARS(s.goal)}</span>
      </p>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clampPct(s.pct)}%` }} />
      </div>
      {reliable && (
        <p className="mt-2 text-xs text-gray-500">
          Proyección a fin de mes:{' '}
          <strong className={s.onTrack ? 'text-ok' : 'text-warn'}>
            {formatARS(Math.max(0, s.projected))}
          </strong>
        </p>
      )}
    </div>
  );
}

function ExtrasCard({ e }) {
  const st = STATUS[e.status];
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${st.box}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-700">Salidas / gastos extras</p>
        <p className={`text-sm font-medium ${st.text}`}>{toPct(e.pct)}</p>
      </div>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {formatARS(e.spent)}{' '}
        <span className="text-base font-normal text-gray-400">de {formatARS(e.budget)}</span>
      </p>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(e.pct)}%` }} />
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {e.remaining >= 0 ? (
          <>
            Te quedan <strong className="text-gray-700">{formatARS(e.remaining)}</strong> ·{' '}
            <strong className="text-gray-700">{formatARS(e.perDayLeft)}/día</strong> por {e.daysLeft} días
          </>
        ) : (
          <>Te pasaste <strong className="text-warn">{formatARS(-e.remaining)}</strong></>
        )}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        A este ritmo terminás en <strong className={st.text}>{formatARS(e.projected)}</strong> ({toPct(e.projectedPct)})
      </p>
    </div>
  );
}

function toPct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}
function clampPct(x) {
  return Math.max(0, Math.min(100, (x || 0) * 100));
}
