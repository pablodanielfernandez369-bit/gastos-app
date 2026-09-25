import { useMemo, useState } from 'react';
import Modal from './Modal';
import { newDebtSettlement, newExpense, todayISO } from '../lib/model';

// "Me lo pagó de otra forma" (un trabajo, un favor, sin plata de por
// medio): deja la deuda de esa persona en $0 y, además, ese valor se carga
// como un gasto normal en la categoría que corresponda (ej. Matías paga
// pintando → gasto de pintura en Vivienda) — así queda registrado que ese
// servicio "se pagó" con la deuda, en vez de perderse. El settlement en sí
// sigue sin contar como ingreso ni sumar al disponible (ver
// selectors.computeLocalBalance); lo que mueve el disponible es el gasto
// nuevo, igual que si hubiera salido plata real a pagar ese servicio.
export default function DebtSettlementModal({ open, onClose, personName, maxAmount, state, actions }) {
  const [amountRaw, setAmountRaw] = useState(maxAmount ? String(maxAmount) : '');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayISO());
  const [asExpense, setAsExpense] = useState(true);
  const [groupId, setGroupId] = useState(state?.config?.diaADiaGroupId || state?.groups?.[0]?.id || null);
  const [subcategoryId, setSubcategoryId] = useState(null);

  const groups = state?.groups || [];
  const subcategories = useMemo(
    () => (state?.subcategories || []).filter((s) => s.groupId === groupId),
    [state, groupId]
  );

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return;
    const note = description.trim();
    actions.addDebtSettlement(
      newDebtSettlement({ personName, amount: n, description: note, date })
    );
    if (asExpense && groupId) {
      actions.addExpense(
        newExpense({
          amount: n,
          currency: 'ARS',
          groupId,
          subcategoryId,
          description: note || `${personName} — pagó saldando la deuda`,
          personName,
          date,
          inputMethod: 'formulario',
        })
      );
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`${personName}: lo saldó de otra forma`}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Para cuando te lo devuelve con un trabajo, un favor u otra cosa que no es plata. Esto
          deja la deuda en $0 y <strong className="text-ink">no suma a tu disponible</strong> por
          sí solo — pero si ese trabajo reemplaza un gasto real (ej. te pintó la casa), marcalo
          abajo para que quede cargado en la categoría que corresponda.
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
            placeholder="ej: me pintó la casa"
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

        {groups.length > 0 && (
          <label className="flex items-start gap-2 rounded-lg border border-hair bg-surface-2 px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={asExpense}
              onChange={(e) => setAsExpense(e.target.checked)}
            />
            <span className="text-ink-soft">Cargar esto también como gasto (el trabajo reemplazó un gasto real)</span>
          </label>
        )}

        {asExpense && groups.length > 0 && (
          <div className="space-y-3 rounded-lg border border-hair bg-surface-2 p-3">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">¿A dónde pasa el gasto?</label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setGroupId(g.id); setSubcategoryId(null); }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      groupId === g.id ? 'text-paper' : 'border-hair bg-surface text-ink-soft'
                    }`}
                    style={groupId === g.id ? { backgroundColor: g.color, borderColor: g.color } : {}}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
            {subcategories.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Subcategoría</label>
                <select
                  className="w-full rounded-lg border border-hair px-3 py-2"
                  value={subcategoryId ?? ''}
                  onChange={(e) => setSubcategoryId(e.target.value || null)}
                >
                  <option value="">Sin categorizar</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

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
