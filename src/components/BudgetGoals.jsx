import { useMemo, useState } from 'react';
import { computeMonthBudget, computeStreak, computeLocalBalance } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';
import Modal from './Modal';

// El cartel de alertas se puede cerrar y no vuelve a aparecer hasta que
// cambie lo que dice (otro % de presupuesto, otra meta que se desvía, etc.):
// se guarda la firma del texto ya visto, no un simple "visto sí/no".
const ALERT_DISMISS_KEY = 'gastos_app_v1_dismissed_alert';
function getDismissedAlert() {
  try {
    return localStorage.getItem(ALERT_DISMISS_KEY) || '';
  } catch {
    return '';
  }
}
function setDismissedAlert(signature) {
  try {
    localStorage.setItem(ALERT_DISMISS_KEY, signature);
  } catch {
    // localStorage no disponible (privado/bloqueado): el cartel no persiste
    // cerrado entre visitas, pero no rompe nada.
  }
}

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
  const local = useMemo(() => computeLocalBalance(state), [state]);
  const hasLocalActivity = Boolean(local && (local.spent > 0 || local.reimbursed > 0));
  const [dismissed, setDismissed] = useState(getDismissedAlert);

  if (!b.hasAnyGoal && !hasLocalActivity) {
    return (
      <div className="rounded-2xl border border-dashed border-hair bg-surface p-4 text-sm text-ink-soft">
        Definí tu <strong className="text-ink">meta de ahorro</strong>, tu{' '}
        <strong className="text-ink">presupuesto de salidas</strong> o tu{' '}
        <strong className="text-ink">presupuesto de día a día</strong> del mes en Ajustes&nbsp;⚙️
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
  if (b.diaADia && b.diaADia.status === 'rojo') {
    alerts.push(
      b.diaADia.spent >= b.diaADia.budget
        ? `Te pasaste del presupuesto de día a día: ${formatARS(b.diaADia.spent)} de ${formatARS(b.diaADia.budget)}.`
        : `Si seguís a este ritmo terminás el mes en ${formatARS(b.diaADia.projected)} de día a día (${toPct(b.diaADia.projectedPct)} del presupuesto).`
    );
  } else if (b.diaADia && b.diaADia.status === 'amarillo') {
    alerts.push(`Ojo con el día a día: llevás ${toPct(b.diaADia.pct)} del presupuesto y quedan ${b.diaADia.daysLeft} días.`);
  }
  if (b.savings && !b.savings.onTrack) {
    alerts.push(`A este ritmo vas a ahorrar ${formatARS(Math.max(0, b.savings.projected))}, por debajo de tu meta de ${formatARS(b.savings.goal)}.`);
  }
  if (b.coherence && !b.coherence.fits) {
    alerts.push(`Lo gastado este mes + tu meta de ahorro + el presupuesto de salidas suman ${formatARS(b.coherence.gap)} más que tu ingreso. Bajá la meta o el presupuesto.`);
  }

  const anyRed = (b.extras && b.extras.status === 'rojo') || (b.diaADia && b.diaADia.status === 'rojo') || (b.coherence && !b.coherence.fits) || (b.savings && !b.savings.onTrack && b.projReliable && b.savings.projected < 0);
  const alertSignature = alerts.join('|');
  const showAlerts = alerts.length > 0 && alertSignature !== dismissed;

  return (
    <div className="space-y-3">
      {showAlerts && (
        <div className={`relative rounded-2xl border p-4 pr-10 text-sm ${anyRed ? 'border-warn/40 bg-warn/5 text-warn' : 'border-caution/40 bg-caution/5 text-caution'}`}>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => { setDismissedAlert(alertSignature); setDismissed(alertSignature); }}
            className="absolute right-3 top-3 leading-none opacity-60 hover:opacity-100"
          >
            ✕
          </button>
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className="num">{a}</li>
            ))}
          </ul>
        </div>
      )}

      <DisponibleCard d={b.disponible} />

      {hasLocalActivity && <LocalBalanceCard l={local} state={state} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {b.savings && <SavingsCard s={b.savings} reliable={b.projReliable} />}
        {b.extras && <ExtrasCard e={b.extras} reliable={b.projReliable} streak={streak} state={state} />}
        {b.diaADia && <DiaADiaCard d={b.diaADia} reliable={b.projReliable} state={state} />}
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

function LocalBalanceCard({ l, state }) {
  const owed = l.balance > 0;
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const gastos = state.expenses
      .filter((e) => e.groupId === l.groupId)
      .map((e) => ({ id: e.id, date: e.date, label: e.description || 'Gasto', amount: -e.amount }));
    const reembolsos = state.incomes
      .filter((i) => i.groupId === l.groupId)
      .map((i) => ({ id: i.id, date: i.date, label: i.description || 'Reembolso', amount: i.amount }));
    return [...gastos, ...reembolsos].sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [open, state, l.groupId]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${owed ? 'border-caution/40 bg-caution/5' : 'border-hair bg-surface'}`}
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Local
        </p>
        <p className={`mt-1.5 font-display text-[1.9rem] font-medium leading-none num ${owed ? 'text-caution' : 'text-ok'}`}>
          {formatARS(Math.abs(l.balance))}
        </p>
        <p className="mt-2 text-xs text-ink-soft num">
          {owed ? 'te deben' : l.balance < 0 ? 'repusiste de más' : 'al día'} ·{' '}
          {formatARS(l.spent)} gastado − {formatARS(l.reimbursed)} repuesto
        </p>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Local">
        <p className="mb-3 text-sm text-ink-soft num">
          {formatARS(l.spent)} gastado − {formatARS(l.reimbursed)} repuesto ={' '}
          <span className="font-semibold text-ink">{formatARS(l.balance)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">{formatDate(it.date)}</p>
                </div>
                <p className={`shrink-0 text-sm font-semibold num ${it.amount < 0 ? 'text-ink' : 'text-ok'}`}>
                  {it.amount < 0 ? '−' : '+'}{formatARS(Math.abs(it.amount))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
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

function ExtrasCard({ e, reliable, streak, state }) {
  const st = STATUS[e.status];
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(new Date().toISOString());
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
  }, [open, state]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${st.box}`}
      >
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

      <Modal open={open} onClose={() => setOpen(false)} title="Salidas / gastos extras">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(e.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink num">{formatARS(it.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function DiaADiaCard({ d, reliable, state }) {
  const st = STATUS[d.status];
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!open) return [];
    const currKey = monthKey(new Date().toISOString());
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
  }, [open, state]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && setOpen(true)}
        className={`cursor-pointer rounded-2xl border p-4 text-left transition active:scale-[0.98] hover:border-ink-faint ${st.box}`}
      >
        <div className="flex items-baseline justify-between">
          <p className="font-display text-[0.95rem] font-medium text-ink">Día a día</p>
          <p className={`text-sm font-semibold num ${st.text}`}>{toPct(d.pct)}</p>
        </div>
        <p className="mt-1.5 font-display text-[1.6rem] font-medium leading-none text-ink num">
          {formatARS(d.spent)}{' '}
          <span className="text-sm font-normal text-ink-faint">de {formatARS(d.budget)}</span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${clampPct(d.pct)}%` }} />
        </div>
        <p className="mt-2.5 text-xs text-ink-soft num">
          {d.remaining >= 0 ? (
            <>Te quedan <strong className="text-ink">{formatARS(d.remaining)}</strong> este mes</>
          ) : (
            <>Te pasaste <strong className="text-warn">{formatARS(-d.remaining)}</strong></>
          )}
        </p>
        {reliable && (
          <p className="mt-1 text-xs text-ink-soft num">
            A este ritmo terminás en <strong className={st.text}>{formatARS(d.projected)}</strong> ({toPct(d.projectedPct)})
          </p>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Día a día">
        <p className="mb-3 text-sm text-ink-soft num">
          Total del mes: <span className="font-semibold text-ink">{formatARS(d.spent)}</span>
        </p>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-faint">Sin movimientos este mes.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {items.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-ink-faint">
                    {formatDate(it.date)}
                    {it.sub ? ` · ${it.sub}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-ink num">{formatARS(it.amount)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}

function toPct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}
function clampPct(x) {
  return Math.max(0, Math.min(100, (x || 0) * 100));
}
