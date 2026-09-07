import { useState } from 'react';
import Modal from './Modal';
import { newIncome, todayISO } from '../lib/model';

export default function IncomeFormModal({ open, onClose, draft, actions, editingId }) {
  const [amountRaw, setAmountRaw] = useState(draft?.amountRaw ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [date, setDate] = useState(draft?.date ?? todayISO());

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return;

    const payload = {
      amount: n,
      description: description.trim() || '(sin descripción)',
      date,
      inputMethod: draft ? 'voz/texto' : 'formulario',
    };

    if (editingId) {
      actions.updateIncome(editingId, payload);
    } else {
      actions.addIncome(newIncome(payload));
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={editingId ? 'Editar ingreso' : 'Confirmar ingreso'}>
      <div className="space-y-4">
        {draft?.rawText && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
            “{draft.rawText}”
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Monto</label>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-3 text-lg"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
          <input
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ej: cobré el sueldo"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-3 font-medium text-gray-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-ok py-3 font-medium text-white"
          >
            Guardar ingreso
          </button>
        </div>
      </div>
    </Modal>
  );
}
