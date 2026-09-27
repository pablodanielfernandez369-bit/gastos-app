import { useState } from 'react';

// Crear/cambiar/borrar billeteras: cada una es una app completa aparte, con
// sus propios gastos/ingresos/categorías, sin nada compartido entre sí. No
// hay pantalla de selección obligatoria (a diferencia de gastoscorujo) — se
// maneja todo desde acá, y la app sigue abriendo directo en la última activa
// de este dispositivo (ver Root.jsx).
export default function WalletManager({ walletId, wallets, onSwitchWallet, onCreateWallet, onDeleteWallet }) {
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!wallets) return null; // todavía no llegó la lista del servidor

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      await onCreateWallet(name);
      setNewName('');
    } catch (err) {
      setError(err.message || 'No se pudo crear la billetera.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(w) {
    if (wallets.length <= 1) return;
    if (!confirm(`¿Borrar la billetera "${w.name}"? Se pierden todos sus datos, esto no se puede deshacer.`)) return;
    setBusy(true);
    setError('');
    try {
      await onDeleteWallet(w.id);
    } catch (err) {
      setError(err.message || 'No se pudo borrar la billetera.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {wallets.map((w) => (
          <div
            key={w.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${
              w.id === walletId ? 'border-accent bg-accent/5' : 'border-hair bg-surface'
            }`}
          >
            <button
              type="button"
              onClick={() => onSwitchWallet(w.id)}
              disabled={busy}
              className="flex-1 text-left text-sm font-medium text-ink"
            >
              {w.name}
              {w.id === walletId && <span className="ml-2 text-xs font-normal text-accent">activa</span>}
            </button>
            {wallets.length > 1 && (
              <button
                type="button"
                onClick={() => handleDelete(w)}
                disabled={busy}
                className="text-ink-faint disabled:opacity-40"
                title="Borrar billetera"
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-warn">{error}</p>}

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-hair px-3 py-2 text-sm"
          placeholder="ej: Efectivo, Ahorro en dólares..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={busy}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy || !newName.trim()}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          + Nueva
        </button>
      </div>
    </div>
  );
}
