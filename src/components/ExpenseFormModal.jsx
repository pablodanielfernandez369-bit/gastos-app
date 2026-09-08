import { useMemo, useState } from 'react';
import Modal from './Modal';
import { newExpense, todayISO } from '../lib/model';

// Un solo componente para dos usos:
// - Confirmación editable después de parsear texto/voz (draft precargado)
// - Carga manual clásica (sin draft, todo en blanco)
// Nunca guarda directo: siempre pasa por este formulario y un botón "Guardar".
export default function ExpenseFormModal({ open, onClose, draft, state, actions, editingId }) {
  const groups = state.groups;
  const [groupId, setGroupId] = useState(draft?.groupId ?? groups[0]?.id ?? null);
  const [subcategoryId, setSubcategoryId] = useState(draft?.subcategoryId ?? null);
  const [amountRaw, setAmountRaw] = useState(draft?.amountRaw ?? '');
  const [currency, setCurrency] = useState(draft?.currency ?? 'ARS');
  const [fxRate, setFxRate] = useState(draft?.fxRate ?? state.config.fxRate ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [personName, setPersonName] = useState(draft?.personName ?? '');
  const [date, setDate] = useState(draft?.date ?? todayISO());
  const [newSubName, setNewSubName] = useState('');
  const [showNewSub, setShowNewSub] = useState(false);

  const subcategories = useMemo(
    () => state.subcategories.filter((s) => s.groupId === groupId),
    [state.subcategories, groupId]
  );

  const amountFinal = useMemo(() => {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n)) return 0;
    if (currency === 'USD') {
      const rate = parseFloat(fxRate);
      return Number.isFinite(rate) ? n * rate : 0;
    }
    return n;
  }, [amountRaw, currency, fxRate]);

  // Aviso no bloqueante: si este gasto va en la categoría de "extras" y con él
  // el mes se pasa del presupuesto, se lo mostramos antes de guardar.
  const extrasWarning = useMemo(() => {
    const cfg = state.config || {};
    if (!cfg.extrasBudget || !groupId || groupId !== cfg.extrasGroupId || amountFinal <= 0) return null;
    const mk = (date || todayISO()).slice(0, 7);
    const spent = state.expenses
      .filter((e) => e.id !== editingId && e.groupId === cfg.extrasGroupId && e.date.slice(0, 7) === mk)
      .reduce((sum, e) => sum + e.amount, 0);
    const after = spent + amountFinal;
    if (after <= cfg.extrasBudget) return null;
    return { after, budget: cfg.extrasBudget };
  }, [state.expenses, state.config, groupId, date, amountFinal, editingId]);

  function handleAddSubcategory() {
    if (!newSubName.trim() || !groupId) return;
    const id = actions.addSubcategory(groupId, newSubName.trim());
    setSubcategoryId(id);
    setNewSubName('');
    setShowNewSub(false);
  }

  function handleSave() {
    const n = parseFloat(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return;
    if (currency === 'USD' && !Number.isFinite(parseFloat(fxRate))) return;
    if (!groupId) return;

    if (currency === 'USD') actions.setFxRate(parseFloat(fxRate));

    const payload = {
      amount: amountFinal,
      currency,
      amountOriginal: currency === 'USD' ? n : null,
      fxRate: currency === 'USD' ? parseFloat(fxRate) : null,
      groupId,
      subcategoryId,
      description: description.trim() || '(sin descripción)',
      personName: personName.trim() || null,
      date,
      type: 'variable',
      inputMethod: draft ? (draft.rawText ? 'voz/texto' : 'formulario') : 'formulario',
      recurringId: draft?.recurringId ?? null,
    };

    if (editingId) {
      actions.updateExpense(editingId, payload);
    } else {
      actions.addExpense(newExpense(payload));
    }
    onClose();
  }

  const missingCategory = !groupId;

  return (
    <Modal open={open} onClose={onClose} title={editingId ? 'Editar gasto' : 'Nuevo gasto'}>
      <div className="space-y-4">
        {draft?.rawText && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-soft italic">
            “{draft.rawText}”
          </p>
        )}

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
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">
              Cotización del día (1 USD = ? ARS)
            </label>
            <input
              type="number"
              inputMode="decimal"
              className="w-full rounded-lg border border-hair px-3 py-2"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              placeholder="ej: 1450"
            />
            <p className="mt-1 text-sm text-ink-soft">
              Total: <strong>{formatPreviewARS(amountFinal)}</strong>
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Categoría</label>
          <div className="flex gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => { setGroupId(g.id); setSubcategoryId(null); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  groupId === g.id
                    ? 'text-paper'
                    : 'border-hair bg-surface text-ink-soft'
                }`}
                style={groupId === g.id ? { backgroundColor: g.color, borderColor: g.color } : {}}
              >
                {g.name}
              </button>
            ))}
          </div>
          {missingCategory && (
            <p className="mt-1 text-sm text-warn">No pude identificar la categoría, elegí una ↑</p>
          )}
          {extrasWarning && (
            <p className="mt-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-sm text-warn num">
              Con este gasto el mes queda en {formatPreviewARS(extrasWarning.after)} de salidas,
              arriba de tu presupuesto de {formatPreviewARS(extrasWarning.budget)}.
            </p>
          )}
        </div>

        {groupId && (
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Subcategoría</label>
            {!showNewSub ? (
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-lg border border-hair px-3 py-2"
                  value={subcategoryId ?? ''}
                  onChange={(e) => setSubcategoryId(e.target.value || null)}
                >
                  <option value="">Sin categorizar</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewSub(true)}
                  className="rounded-lg border border-hair px-3 py-2 text-sm text-ink-soft"
                >
                  + nueva
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-hair px-3 py-2"
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  placeholder="Nombre de la subcategoría"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddSubcategory}
                  className="rounded-lg bg-accent px-3 py-2 text-sm text-paper"
                >
                  Crear
                </button>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Descripción</label>
          <input
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ej: compra de insumos panadería"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Nombre (opcional)</label>
          <input
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder="ej: Mel — para poder preguntarle al asistente por este nombre"
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
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-hair py-3 font-medium text-ink-soft"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-lg bg-accent py-3 font-medium text-paper"
          >
            Guardar gasto
          </button>
        </div>
      </div>
    </Modal>
  );
}

function formatPreviewARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
}
