import { useState } from 'react';
import Modal from './Modal';
import { newIncome, todayISO } from '../lib/model';

// Formulario dedicado para "me repuso en efectivo": solo monto y quién,
// igual que PrestamoLoanModal. Guarda un ingreso marcado con el groupId de
// Préstamo (se descuenta de lo que esa persona debe y sube el disponible,
// a diferencia de "lo saldó de otra forma").
export default function PrestamoReembolsoModal({ open, onClose, groupId, personName, knownPeople, actions }) {
  const [amountRaw, setAmountRaw] = useState('');
  const [name, setName] = useState(personName || '');

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0 || !name.trim()) return;
    actions.addIncome(
      newIncome({ amount: n, groupId, personName: name.trim(), description: 'Reembolso', date: todayISO() })
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Me repuso en efectivo">
      <div className="space-y-4">
        <div>
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

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Quién te repuso</label>
          <input
            list="prestamo-personas"
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ej: Juan, Local, Mel"
          />
          <datalist id="prestamo-personas">
            {(knownPeople || []).map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-hair py-3 font-medium text-ink-soft">
            Cancelar
          </button>
          <button onClick={handleSave} className="flex-1 rounded-lg bg-ok py-3 font-medium text-paper">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
