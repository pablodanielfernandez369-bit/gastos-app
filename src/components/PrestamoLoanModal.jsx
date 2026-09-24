import { useState } from 'react';
import Modal from './Modal';
import { newExpense, todayISO } from '../lib/model';

// Formulario dedicado para "presté plata": solo monto y a quién, nada del
// formulario general de gastos (categoría/moneda/subcategoría) que
// generaba confusión acá. El nombre sugiere las personas que ya existen en
// Préstamo (con un <datalist>) para no crear una variante por accidente
// (ver selectors.normalizePersonKey para el fondo del problema).
export default function PrestamoLoanModal({ open, onClose, groupId, personName, knownPeople, actions }) {
  const [amountRaw, setAmountRaw] = useState('');
  const [name, setName] = useState(personName || '');

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0 || !name.trim()) return;
    actions.addExpense(
      newExpense({ amount: n, groupId, personName: name.trim(), date: todayISO() })
    );
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Presté plata">
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
          <label className="block text-xs font-medium text-ink-soft mb-1">A quién</label>
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
          <button onClick={handleSave} className="flex-1 rounded-lg bg-accent py-3 font-medium text-paper">
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
