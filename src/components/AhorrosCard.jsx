import { useMemo, useState } from 'react';
import { computeSavings } from '../lib/selectors';
import { formatARS, formatDate } from '../lib/format';
import Modal from './Modal';
import MonoChip from './MonoChip';

const COLOR = '#5A7D2A';

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

function parseAmount(v) {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Variación con flecha: verde si subió, rojo si bajó, gris si quedó igual.
function Delta({ value, fmt }) {
  if (Math.abs(value) < 0.5) return <span className="text-ink-faint">= {fmt(0)}</span>;
  const up = value > 0;
  return (
    <span className={`font-semibold ${up ? 'text-ok' : 'text-warn'}`}>
      {up ? '▲' : '▼'} {fmt(Math.abs(value))}
    </span>
  );
}

// "Ahorros": el único saldo que se traslada de un mes al otro (el resto de
// las billeteras arranca de cero cada mes). Completamente manual: solo
// cambia cuando el usuario carga un saldo nuevo desde el detalle.
export default function AhorrosCard({ state, actions, now, rate }) {
  const [open, setOpen] = useState(false);
  const [arsInput, setArsInput] = useState('');
  const [usdInput, setUsdInput] = useState('');
  const s = useMemo(() => computeSavings(state, now), [state, now]);
  const monthName = now.toLocaleDateString('es-AR', { month: 'long' });
  const since = s.baselineDate ? `desde el ${formatDate(s.baselineDate)}` : `en ${monthName}`;

  function openDetail() {
    // El formulario actualiza el saldo de HOY, aunque se esté mirando otro mes.
    const today = computeSavings(state, new Date()).balance;
    setArsInput(today ? String(Math.round(today.ars)) : '');
    setUsdInput(today ? String(Math.round(today.usd)) : '');
    setOpen(true);
  }

  function save() {
    const ars = parseAmount(arsInput || '0');
    const usd = parseAmount(usdInput || '0');
    if (ars === null || usd === null) return;
    actions.setSavingsBalance({ ars, usd });
    setOpen(false);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && openDetail()}
        className="flex cursor-pointer items-center gap-3 rounded-2xl border border-hair p-4 text-left transition active:scale-[0.98] hover:border-ink-faint"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${COLOR} 16%, #FCFAF5) 0%, #FCFAF5 75%)` }}
      >
        <MonoChip color={COLOR} letter="A" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.95rem] font-medium text-ink">Ahorros</p>
          {!s.hasAnchor ? (
            <p className="mt-2 text-xs text-ink-soft">Tocá para cargar cuánto tenés ahorrado</p>
          ) : !s.balance ? (
            <p className="mt-2 text-xs text-ink-soft">Sin datos antes del {formatDate(s.firstDate)}</p>
          ) : (
            <>
              <p className="mt-1.5 font-numeral text-[1.6rem] font-medium leading-none text-ink num">
                {formatUsd(s.balance.usd)}
              </p>
              <p className="mt-1.5 font-numeral text-lg font-medium leading-none text-ink num">
                {formatARS(s.balance.ars)}
              </p>
              <p className="mt-2.5 text-xs text-ink-soft num">
                <Delta value={s.deltaUsd} fmt={formatUsd} /> · <Delta value={s.deltaArs} fmt={formatARS} /> {since}
              </p>
            </>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Ahorros">
        {s.balance && (
          <>
            <p className="text-sm text-ink-soft num">
              Saldo: <span className="font-semibold text-ink">{formatUsd(s.balance.usd)}</span> ·{' '}
              <span className="font-semibold text-ink">{formatARS(s.balance.ars)}</span>
            </p>
            {rate ? (
              <p className="mt-1 text-xs text-ink-faint num">
                Todo junto ≈ {formatARS(s.balance.ars + s.balance.usd * rate)} al blue de hoy
              </p>
            ) : null}

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-[0.7rem] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="pb-1 font-semibold">Mes</th>
                  <th className="pb-1 text-right font-semibold">Dólares</th>
                  <th className="pb-1 text-right font-semibold">Pesos</th>
                </tr>
              </thead>
              <tbody>
                {s.history.slice().reverse().map((m) => (
                  <tr key={m.month} className="border-t border-hair align-top">
                    <td className="py-2 capitalize text-ink-soft">{m.label}</td>
                    <td className="py-2 text-right num">
                      <p className="font-medium text-ink">{formatUsd(m.balance.usd)}</p>
                      <p className="text-xs"><Delta value={m.deltaUsd} fmt={formatUsd} /></p>
                    </td>
                    <td className="py-2 text-right num">
                      <p className="font-medium text-ink">{formatARS(m.balance.ars)}</p>
                      <p className="text-xs"><Delta value={m.deltaArs} fmt={formatARS} /></p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-faint">
              El saldo solo cambia cuando vos lo actualizás acá abajo. Tus gastos e ingresos no lo tocan.
            </p>
          </>
        )}

        <div className="mt-5 border-t border-hair pt-4">
          <p className="text-sm font-medium text-ink">
            {s.hasAnchor ? 'Actualizar el saldo' : 'Cargar el saldo de hoy'}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Poné lo que tenés ahorrado hoy, en dólares y en pesos.
          </p>
          <div className="mt-3 flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">Dólares (US$)</label>
              <input
                inputMode="decimal"
                className="w-full rounded-lg border border-hair px-3 py-2.5 text-base"
                value={usdInput}
                onChange={(e) => setUsdInput(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-ink-soft">Pesos ($)</label>
              <input
                inputMode="decimal"
                className="w-full rounded-lg border border-hair px-3 py-2.5 text-base"
                value={arsInput}
                onChange={(e) => setArsInput(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            className="mt-3 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-paper"
          >
            Guardar saldo
          </button>
        </div>
      </Modal>
    </>
  );
}
