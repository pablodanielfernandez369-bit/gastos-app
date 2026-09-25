import { useState } from 'react';
import Modal from './Modal';
import { newExchange, todayISO } from '../lib/model';
import { formatARS } from '../lib/format';

// Compra o venta de dólares. Todo se escribe a mano (a veces se compra/vende
// a otro precio): USD, cotización y pesos. Si se cargan USD y cotización,
// los pesos se calculan solos hasta que se editen a mano.
export default function ExchangeFormModal({ open, onClose, draft, actions, editingId }) {
  const [kind, setKind] = useState(draft?.kind || 'compra');
  const [usd, setUsd] = useState(draft?.usd ?? '');
  const [rate, setRate] = useState(draft?.rate ?? '');
  const [ars, setArs] = useState(draft?.ars ?? '');
  const [arsTouched, setArsTouched] = useState(Boolean(draft));
  const [description, setDescription] = useState(draft?.description ?? '');
  const [date, setDate] = useState(draft?.date ?? todayISO());

  const isVenta = kind === 'venta';

  function recalc(nextUsd, nextRate) {
    const u = parseFloat(nextUsd);
    const r = parseFloat(nextRate);
    if (!arsTouched && u > 0 && r > 0) setArs(String(Math.round(u * r)));
  }

  function handleSave() {
    const u = parseFloat(usd);
    const a = parseFloat(ars);
    if (!(u > 0) || !(a > 0)) return;
    const r = parseFloat(rate);
    const payload = {
      kind,
      usd: u,
      ars: a,
      rate: r > 0 ? r : a / u,
      description: description.trim(),
      date,
    };
    if (editingId) actions.updateExchange(editingId, payload);
    else actions.addExchange(newExchange(payload));
    onClose();
  }

  const u = parseFloat(usd);
  const a = parseFloat(ars);

  return (
    <Modal open={open} onClose={onClose} title={editingId ? (isVenta ? 'Editar venta de dólares' : 'Editar compra de dólares') : (isVenta ? 'Vendí dólares' : 'Compré dólares')}>
      <div className="space-y-4">
        {!editingId && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setKind('compra')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                !isVenta ? 'border-ink bg-ink text-paper' : 'border-hair bg-surface text-ink-soft'
              }`}
            >
              Compré
            </button>
            <button
              type="button"
              onClick={() => setKind('venta')}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                isVenta ? 'border-ink bg-ink text-paper' : 'border-hair bg-surface text-ink-soft'
              }`}
            >
              Vendí
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-ink-soft mb-1">
              USD {isVenta ? 'vendidos' : 'comprados'}
            </label>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
              value={usd}
              onChange={(e) => {
                setUsd(e.target.value);
                recalc(e.target.value, rate);
              }}
              placeholder="0"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-ink-soft mb-1">Cotización ($ por USD)</label>
            <input
              type="number"
              inputMode="decimal"
              className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value);
                recalc(usd, e.target.value);
              }}
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">
            Pesos que {isVenta ? 'entraron' : 'salieron'}
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
            value={ars}
            onChange={(e) => {
              setArs(e.target.value);
              setArsTouched(true);
            }}
            placeholder="0"
          />
          {u > 0 && a > 0 && (
            <p className="mt-1 text-xs text-ink-faint">
              {isVenta
                ? `Se suman ${formatARS(a)} a tu disponible en pesos y se restan US$ ${u} de tus dólares.`
                : `Se restan ${formatARS(a)} de tus pesos y se suman US$ ${u} a tus dólares.`}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Nota (opcional)</label>
          <input
            className="w-full rounded-lg border border-hair px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isVenta ? 'ej: para pagar la tarjeta' : 'ej: en la cueva'}
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
            Guardar {isVenta ? 'venta' : 'compra'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
