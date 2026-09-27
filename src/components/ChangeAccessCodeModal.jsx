import { useState } from 'react';
import Modal from './Modal';
import { changeAccessCode } from '../lib/storage';

// Al cambiarla, este dispositivo se queda andando solo con la nueva;
// cualquier otro dispositivo con la vieja guardada (aunque sea el que la
// armó originalmente) va a perder el acceso la próxima vez que la app se
// fije si sigue valiendo (ver AccessGate.jsx).
export default function ChangeAccessCodeModal({ open, onClose }) {
  const [newCode, setNewCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  function handleClose() {
    setNewCode('');
    setConfirm('');
    setError('');
    setDone(false);
    onClose();
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    if (newCode.length < 4) return setError('Mínimo 4 caracteres.');
    if (newCode !== confirm) return setError('No coinciden.');
    setSaving(true);
    try {
      await changeAccessCode(newCode);
      setDone(true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cambiar contraseña">
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Listo, quedó cambiada. Este dispositivo sigue andando solo. Cualquier otro dispositivo
            va a tener que cargar la clave nueva la próxima vez que entre.
          </p>
          <button onClick={handleClose} className="w-full rounded-lg bg-ink py-3 font-medium text-paper">
            Listo
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-sm text-ink-soft">
            Al guardar, este dispositivo se queda con la clave nueva; los demás van a tener que
            cargarla de nuevo.
          </p>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Clave nueva</label>
            <input
              type="password"
              autoFocus
              className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Mínimo 4 caracteres"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Repetila</label>
            <input
              type="password"
              className="w-full rounded-lg border border-hair px-3 py-3 text-lg"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-warn">{error}</p>}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleClose} className="flex-1 rounded-lg border border-hair py-3 font-medium text-ink-soft">
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-ink py-3 font-medium text-paper disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
