import { useEffect, useState } from 'react';
import { getAccessCode, setAccessCode, clearAccessCode } from '../lib/storage';

// Pantalla de clave antes de mostrar la app. El celular que la carga una vez
// queda andando solo (la clave se guarda en ese dispositivo y se manda sola
// en cada pedido al servidor); cualquier otro que abra el link sin la clave
// correcta no puede ver ni tocar los datos.
async function verify(code) {
  try {
    const res = await fetch('/api/access-check', {
      headers: code ? { 'x-access-code': code } : {},
    });
    return res.ok;
  } catch {
    return true; // sin conexión: no le cortamos el paso a un dispositivo ya habilitado
  }
}

export default function AccessGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | unlocked
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await verify(getAccessCode());
      if (ok) {
        setStatus('unlocked');
      } else {
        clearAccessCode();
        setStatus('locked');
      }
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setChecking(true);
    const code = input.trim();
    const ok = await verify(code);
    setChecking(false);
    if (ok) {
      setAccessCode(code);
      setStatus('unlocked');
    } else {
      setError('Clave incorrecta.');
    }
  }

  if (status === 'checking') return null;
  if (status === 'unlocked') return children;

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-6 bg-paper px-6">
      <h1 className="font-display text-2xl font-medium tracking-tight text-ink">Mis gastos y ahorro</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3">
        <input
          type="password"
          autoFocus
          className="w-full rounded-lg border border-hair bg-surface px-3 py-3 text-center text-lg"
          placeholder="Clave de acceso"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        {error && <p className="text-center text-sm text-warn">{error}</p>}
        <button
          type="submit"
          disabled={!input.trim() || checking}
          className="w-full rounded-lg bg-accent py-3 font-medium text-paper disabled:opacity-40"
        >
          {checking ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
