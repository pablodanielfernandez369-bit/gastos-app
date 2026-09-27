import { useEffect, useState } from 'react';
import { getAccessCode, setAccessCode, clearAccessCode } from '../lib/storage';

// Pantalla de clave antes de mostrar la app. El celular que la carga una vez
// queda andando solo (la clave se guarda en ese dispositivo y se manda sola
// en cada pedido al servidor); cualquier otro que abra el link sin la clave
// correcta no puede ver ni tocar los datos.
//
// Devuelve 'ok' | 'wrong' | 'unknown'. Solo 'wrong' (401 explícito, la clave
// que mandamos no es la que el server tiene guardada AHORA) borra la clave
// guardada y vuelve a pedirla — cualquier otro problema (sin conexión, el
// servidor tardando en despertar, un 502/503 pasajero) se trata como "no se
// pudo confirmar todavía", no como clave incorrecta, para no estar pidiendo
// la clave de nuevo por algo que no tiene que ver con la clave.
async function verify(code) {
  try {
    const res = await fetch('/api/access-check', {
      headers: code ? { 'x-access-code': code } : {},
    });
    if (res.ok) return 'ok';
    return res.status === 401 ? 'wrong' : 'unknown';
  } catch {
    return 'unknown';
  }
}

export default function AccessGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | unlocked
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      const storedCode = getAccessCode();
      const result = await verify(storedCode);
      if (result === 'wrong') {
        clearAccessCode();
        setStatus('locked');
      } else if (result === 'ok') {
        setStatus('unlocked');
      } else {
        // No se pudo confirmar (sin conexión, servidor despertando, etc): un
        // dispositivo que ya tenía una clave guardada pasa igual — recién si
        // el server dice explícitamente que está mal lo sacamos afuera.
        setStatus(storedCode ? 'unlocked' : 'locked');
      }
    })();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setChecking(true);
    const code = input.trim();
    const result = await verify(code);
    setChecking(false);
    if (result === 'ok') {
      setAccessCode(code);
      setStatus('unlocked');
    } else if (result === 'wrong') {
      setError('Clave incorrecta.');
    } else {
      setError('No se pudo confirmar, probá de nuevo.');
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
