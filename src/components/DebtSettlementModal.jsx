import { useState } from 'react';
import Modal from './Modal';
import { newDebtSettlement, todayISO } from '../lib/model';

// "Me lo pagó de otra forma" (un trabajo, un favor, sin plata de por
// medio): deja la deuda de esa persona en $0 pero, a diferencia de un
// reembolso real, NO cuenta como ingreso ni le suma nada al disponible.
export default function DebtSettlementModal({ open, onClose, personName, maxAmount, actions }) {
  const [amountRaw, setAmountRaw] = useState(maxAmount ? String(maxAmount) : '');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return;
    actions.addDebtSettlement(
      newDebtSettlement({ personName, amount: n, description: description.trim(), date })
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${personName}: lo saldó de otra forma`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Para cuando te lo devuelve con un trabajo, un favor u otra cosa que no es plata. Esto
          deja la deuda en $0 pero <strong className="text-ink">no suma a tu disponible</strong>.
        </p>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Monto a saldar</label>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            placeholder="0"
          />
          {maxAmount > 0 && (
            <p className="mt-1 text-xs text-ink-faint">Te debía {formatPreviewARS(maxAmount)}.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Nota (opcional)</label>
          <input
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ej: me arregló el auto"
          />
        </div>

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
          <button onClick={onClose} className="flex-1 rounded-lg border border-hair py-3 font-medium text-ink-soft">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex-1 rounded-lg bg-ink py-3 font-medium text-paper">
            Saldar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatPreviewARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
}
