import { useMemo } from 'react';
import { computeMonthBudget, computeStreak } from '../lib/selectors';
import { formatARS } from '../lib/format';

// Semáforo del presupuesto de extras del mes en curso + estado de la meta de
// ahorro. Siempre usa el mes calendario actual, sin importar el filtro de
// período del dashboard (las metas son mensuales).
const STATUS = {
  verde: { bar: 'bg-ok', text: 'text-ok', box: 'border-hair bg-surface' },
  amarillo: { bar: 'bg-caution', text: 'text-caution', box: 'border-caution/40 bg-caution/5' },
  rojo: { bar: 'bg-warn', text: 'text-warn', box: 'border-warn/40 bg-warn/5' },
};

export default function BudgetGoals({ state }) {
  const b = useMemo(() => computeMonthBudget(state), [state]);
  const streak = useMemo(() => computeStreak(state), [state]);

  if (!b.hasAnyGoal) {
    return (
      <div className="rounded-2xl border border-dashed border-hair bg-surface p-4 text-sm text-ink-soft">
        Definí tu <strong className="text-ink">meta de ahorro</strong> y tu{' '}
        <strong className="text-ink">presupuesto de salidas</strong> del mes en Ajustes&nbsp;⚙️
        para ver acá cómo venís.
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
    alerts.push(`Lo gastado este mes + tu meta de ahorro + el presupuesto de salidas suman ${formatARS(b.coherence.gap)} más que tu ingreso. Bajá la meta o el presupuesto.`);
  }

  const anyRed = (b.extras && b.extras.status === 'rojo') || (b.coherence && !b.coherence.fits) || (b.savings && !b.savings.onTrack && b.projReliable && b.savings.projected < 0);

  return (
    <div className="space-y-3">
      {alerts.length > 0 && (
        <div className={`rounded-2xl border p-4 text-sm ${anyRed ? 'border-warn/40 bg-warn/5 text-warn' : 'border-caution/40 bg-caution/5 text-caution'}`}>
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className="num">{a}</li>
            ))}
          </ul>
        </div>
      )}

      <DisponibleCard d={b.disponible} />

      <div className="grid gap-3 sm:grid-cols-2">
        {b.savings && <SavingsCard s={b.savings} reliable={b.projReliable} />}
        {b.extras && <ExtrasCard e={b.extras} reliable={b.projReliable} streak={streak} />}
      </div>
    </div>
  );
}

function DisponibleCard({ d }) {
  const good = d.value >= 0;
  return (
    <div className={`rounded-2xl border p-4 ${good ? 'border-hair bg-surface' : 'border-warn/40 bg-warn/5'}`}>
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Disponible para gastar
      </p>
      <p className={`mt-1.5 font-display text-[1.9rem] font-medium leading-none num ${good ? 'text-ink' : 'text-warn'}`}>
        {formatARS(d.value)}
      </p>
      <p className="mt-2 text-xs text-ink-soft num">
        {formatARS(d.incomeTotal)} cobrado − {formatARS(d.expenseTotal)} gastado
        {d.savingsGoal > 0 && <> − {formatARS(d.savingsGoal)} de meta</>}
        {d.pendingRecurringTotal > 0 && <> − {formatARS(d.pendingRecurringTotal)} pendiente</>}
      </p>
      {!good && (
        <p className="mt-1 text-xs text-warn">
          Ya comprometiste más de lo que cobraste este mes. Va a mejorar en cuanto entre más plata.
        </p>
      )}
    </div>
  );
}

function SavingsCard({ s, reliable }) {
  const good = s.current >= s.goal || s.onTrack;
  return (
    <div className="rounded-2xl border border-hair bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[0.95rem] font-medium text-ink">Meta de ahorro del mes</p>
        <p className={`text-sm font-semibold num ${good ? 'text-ok' : 'text-warn'}`}>{toPct(s.pct)}</p>
      </div>
      <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
        {formatARS(s.current)}{' '}
        <span className="text-sm font-normal text-ink-faint">de {formatARS(s.goal)}</span>
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${good ? 'bg-ok' : 'bg-warn'}`} style={{ width: `${clampPct(s.pct)}%` }} />
      </div>
      {reliable && (
        <p className="mt-2.5 text-xs text-ink-soft num">
          Proyección a fin de mes:{' '}
          <strong className={s.onTrack ? 'text-ok' : 'text-warn'}>{formatARS(Math.max(0, s.projected))}</strong>
        </p>
      )}
    </div>
  );
}

function ExtrasCard({ e, reliable, streak }) {
  const st = STATUS[e.status];
  return (
    <div className={`rounded-2xl border p-4 ${st.box}`}>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[0.95rem] font-medium text-ink">Salidas / gastos extras</p>
        <p className={`text-sm font-semibold num ${st.text}`}>{toPct(e.pct)}</p>
      </div>
      {streak && streak.streak > 0 && (
        <p className="mt-0.5 text-xs font-medium text-ok">
          🔥 {streak.streak} {streak.streak === 1 ? 'día' : 'días'} en verde este mes
        </p>
      )}
      <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
        {formatARS(e.spent)}{' '}
        <span className="text-sm font-normal text-ink-faint">de {formatARS(e.budget)}</span>
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(e.pct)}%` }} />
      </div>
      <p className="mt-2.5 text-xs text-ink-soft num">
        {e.remaining >= 0 ? (
          <>
            Te quedan <strong className="text-ink">{formatARS(e.remaining)}</strong> ·{' '}
            <strong className="text-ink">{formatARS(e.perDayLeft)}/día</strong> por {e.daysLeft} días
          </>
        ) : (
          <>Te pasaste <strong className="text-warn">{formatARS(-e.remaining)}</strong></>
        )}
      </p>
      {reliable && (
        <p className="mt-1 text-xs text-ink-soft num">
          A este ritmo terminás en <strong className={st.text}>{formatARS(e.projected)}</strong> ({toPct(e.projectedPct)})
        </p>
      )}
    </div>
  );
}

function toPct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}
function clampPct(x) {
  return Math.max(0, Math.min(100, (x || 0) * 100));
}
