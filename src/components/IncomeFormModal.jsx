import { useMemo, useState } from 'react';
import Modal from './Modal';
import { newIncome, todayISO } from '../lib/model';
import { useDolar, usdRate } from '../lib/useDolar';

// La cotización para convertir un ingreso en USD a su equivalente en ARS
// (que se usa internamente para la capacidad de ahorro y las metas) se toma
// sola del dólar blue del día — nunca se le pregunta al usuario.
export default function IncomeFormModal({ open, onClose, draft, state, actions, editingId }) {
  const [amountRaw, setAmountRaw] = useState(draft?.amountRaw ?? '');
  const [currency, setCurrency] = useState(draft?.currency ?? 'ARS');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [date, setDate] = useState(draft?.date ?? todayISO());
  const [isLocalReimbursement, setIsLocalReimbursement] = useState(Boolean(draft?.groupId));

  const dolar = useDolar();
  const rate = usdRate(state?.config, dolar) || draft?.fxRate || null;
  const localGroup = state?.groups?.find((g) => /^local$/i.test(g.name));

  const amountFinal = useMemo(() => {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n)) return 0;
    if (currency === 'USD') return rate ? n * rate : n;
    return n;
  }, [amountRaw, currency, rate]);

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return;

    const payload = {
      amount: amountFinal,
      currency,
      amountOriginal: currency === 'USD' ? n : null,
      fxRate: currency === 'USD' ? rate : null,
      description: description.trim() || '(sin descripción)',
      date,
      inputMethod: 'formulario',
      groupId: isLocalReimbursement && localGroup ? localGroup.id : null,
    };

    if (editingId) {
      actions.updateIncome(editingId, payload);
    } else {
      actions.addIncome(newIncome(payload));
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editingId ? 'Editar ingreso' : 'Nuevo ingreso'}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-ink-soft mb-1">Monto</label>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-ink-soft mb-1">Moneda</label>
            <select
              className="w-full rounded-lg border border-hair px-2 py-3"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {currency === 'USD' && (
          <p className="text-sm text-ink-soft">
            Se guarda en dólares.
            {rate ? (
              <> Equivale a <strong>{formatPreviewARS(amountFinal)}</strong> al dólar de hoy ({formatPreviewARS(rate)}).</>
            ) : (
              ' No hay cotización disponible ahora, se ajusta sola cuando vuelva a haber conexión.'
            )}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Descripción</label>
          <input
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ej: cobré el sueldo"
          />
        </div>

        {localGroup && (
          <label className="flex items-center gap-2 rounded-lg border border-hair px-3 py-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={isLocalReimbursement}
              onChange={(e) => setIsLocalReimbursement(e.target.checked)}
            />
            Es un reembolso del local (se descuenta de lo gastado ahí)
          </label>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Fecha</label>
          <input
            type="date"
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-hair py-3 font-medium text-ink-soft"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-ok py-3 font-medium text-paper"
          >
            Guardar ingreso
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatPreviewARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
}
