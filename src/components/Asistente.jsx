import { useCallback, useEffect, useRef, useState } from 'react';
import { accessHeaders } from '../lib/storage';

// Chat con el bot de la app (server/chatbot.js): cargás gastos escribiendo
// ("gasté 15 mil en el super"), le preguntás cosas ("¿cuánto gasté
// este mes?"), y acá llegan los avisos de Mercado Pago para confirmarlos.

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...accessHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const EJEMPLOS = [
  'Gasté 15 mil en el super',
  '8000 de nafta',
  '¿Cuánto gasté este mes?',
  '¿Cómo viene mi ahorro respecto al mes pasado?',
  'Resumen',
];

// *negrita* (como en Telegram) y saltos de línea.
function RichText({ text }) {
  return (
    <span className="whitespace-pre-line">
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? <strong key={i}>{part.slice(1, -1)}</strong> : part.replace(/_([^_\n]+)_/g, '$1')
      )}
    </span>
  );
}

const fmt = (n) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
const money = (p) => (p.currency === 'USD' ? `US$ ${fmt(p.amount)}` : `$ ${fmt(p.amount)}`);

function mpWhen(o) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(o.createdAt)).replace(',', '');
}

// --- Push: avisos de Mercado Pago aunque la app esté cerrada ---

function urlB64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function subscribePush() {
  const { key } = await api('/api/push/key');
  if (!key) throw new Error('El servidor todavía no tiene las notificaciones configuradas');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) }));
  await api('/api/push/subscribe', { subscription: sub.toJSON() });
}

function PushBanner() {
  const [perm, setPerm] = useState(() => (pushSupported ? Notification.permission : 'unsupported'));
  const [err, setErr] = useState(null);

  // Si ya diste permiso, re-registrar en silencio (por si cambió algo del lado del server).
  useEffect(() => {
    if (perm === 'granted') subscribePush().catch(() => {});
  }, [perm]);

  if (perm === 'granted' || perm === 'unsupported') return null;

  async function enable() {
    setErr(null);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return setErr('Sin permiso no puedo avisarte. Activalo en los ajustes del celular → Notificaciones.');
      await subscribePush();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-accent/30 bg-surface p-3 text-sm">
      <p className="text-ink">🔔 Activá las notificaciones para que los gastos de Mercado Pago te lleguen acá.</p>
      <button onClick={enable} className="mt-2 rounded-lg bg-accent px-3 py-2 font-semibold text-paper">
        Activar notificaciones
      </button>
      {err && <p className="mt-2 text-xs text-warn">{err}</p>}
    </div>
  );
}

// --- Tarjeta de un gasto esperando confirmación ---

function PendingCard({ pending, state, onAction }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [groupId, setGroupId] = useState(pending.groupId || state.groups[0]?.id || '');
  const [subId, setSubId] = useState('none');

  async function act(body) {
    setBusy(true);
    try {
      await onAction(body);
    } finally {
      setBusy(false);
    }
  }

  const mp = pending.mp;
  const header = mp && (
    <p className="mb-1 text-xs font-semibold text-accent">
      {mp.test && '🧪 PRUEBA · '}💸 Detecté un gasto en {mp.source || 'Mercado Pago'} ({mpWhen(mp)})
    </p>
  );
  const btn = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40';

  // Peaje: Mercado Pago no dice de quién es el auto.
  if (!pending.amount && mp?.toll) {
    return (
      <div className="mr-8 rounded-2xl rounded-bl-md border border-accent/30 bg-surface p-3 text-sm text-ink">
        {header}
        <p>🚗 <strong>Peaje {money(mp)}</strong> — ¿de quién es?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => act({ action: 'person', who: 'me' })} className={`${btn} bg-accent text-paper`}>Mío</button>
          <button disabled={busy} onClick={() => act({ action: 'person', who: 'mel' })} className={`${btn} bg-accent text-paper`}>Mel</button>
          <button disabled={busy} onClick={() => act({ action: 'cancel' })} className={`${btn} border border-hair text-ink-faint`}>No lo cargo</button>
        </div>
      </div>
    );
  }

  const g = pending.newGroupName
    ? `${pending.newGroupName} (nueva)`
    : state.groups.find((x) => x.id === pending.groupId)?.name || 'sin categoría';
  const sub = pending.newSubcategoryName
    ? ` › ${pending.newSubcategoryName} (nueva)`
    : (s => (s ? ` › ${s.name}` : ''))(state.subcategories.find((x) => x.id === pending.subcategoryId));
  const subs = state.subcategories.filter((s) => s.groupId === groupId);

  return (
    <div className="mr-8 rounded-2xl rounded-bl-md border border-accent/30 bg-surface p-3 text-sm text-ink">
      {header}
      <p>📝 <strong>{money(pending)}</strong> — {pending.description}</p>
      <p className="text-ink-faint">Categoría: <strong className="text-ink">{g}{sub}</strong></p>
      {pending.personName && <p className="text-ink-faint">Nombre: <strong className="text-ink">{pending.personName}</strong></p>}

      {picking ? (
        <div className="mt-2 space-y-2">
          <select className="w-full rounded-lg border border-hair bg-paper px-2 py-2" value={groupId}
            onChange={(e) => { setGroupId(e.target.value); setSubId('none'); }}>
            {state.groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select className="w-full rounded-lg border border-hair bg-paper px-2 py-2" value={subId} onChange={(e) => setSubId(e.target.value)}>
            <option value="none">Sin subcategoría</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="new">➕ Nueva: {pending.description}</option>
          </select>
          <div className="flex gap-2">
            <button disabled={busy || !groupId} onClick={() => act({ action: 'save', groupId, subcategoryId: subId })} className={`${btn} flex-1 bg-accent text-paper`}>✅ Guardar acá</button>
            <button disabled={busy} onClick={() => setPicking(false)} className={`${btn} border border-hair text-ink-faint`}>Volver</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => act({ action: 'save' })} className={`${btn} flex-1 bg-accent text-paper`}>✅ Guardar</button>
          <button disabled={busy} onClick={() => setPicking(true)} className={`${btn} border border-hair text-ink`}>📁 Otra categoría</button>
          <button disabled={busy} onClick={() => act({ action: 'cancel' })} className={`${btn} border border-hair text-ink-faint`}>❌</button>
        </div>
      )}
      {!picking && (
        <p className="mt-2 text-xs text-ink-faint">Si algo está mal, escribime la corrección (ej: "eran 25000", "va en super").</p>
      )}
    </div>
  );
}

export default function Asistente({ state }) {
  const [text, setText] = useState('');
  const [view, setView] = useState({ messages: [], pendings: {} });
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(null); // texto que se está mandando
  const [netError, setNetError] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setView(await api('/api/chat'));
      setNetError(false);
    } catch {
      setNetError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Al abrir, cada 10s con la app visible y al volver a ella (llegan avisos de MP).
  useEffect(() => {
    load();
    const tick = () => { if (!document.hidden) load(); };
    const iv = setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [view, sending]);

  async function send(msg) {
    setText('');
    setSending(msg);
    try {
      const next = await api('/api/chat', { text: msg });
      setView(next);
    } catch {
      setNetError(true);
      setText(msg); // que no se pierda lo que escribiste
    } finally {
      setSending(null);
    }
  }

  async function onAction(pendingId, body) {
    try {
      const next = await api(`/api/chat/pending/${pendingId}`, body);
      setView(next);
      if (next.changed) window.dispatchEvent(new Event('gastos:server-changed'));
    } catch {
      setNetError(true);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    send(text.trim());
  }

  const typing = (
    <span className="inline-flex gap-1 text-ink-faint">
      <span className="animate-bounce">·</span>
      <span className="animate-bounce [animation-delay:0.15s]">·</span>
      <span className="animate-bounce [animation-delay:0.3s]">·</span>
    </span>
  );

  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto pb-2">
        <PushBanner />

        {loaded && view.messages.length === 0 && !sending && (
          <div className="rounded-2xl border border-hair bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-ink">
              Escribime un gasto y lo cargo, o preguntame cómo venís. Por ejemplo:
            </p>
            <ul className="space-y-1.5">
              {EJEMPLOS.map((ej) => (
                <li key={ej}>
                  <button onClick={() => send(ej)} className="text-left text-sm text-accent underline">
                    {ej}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.messages.map((m) => {
          if (m.from === 'me') {
            return (
              <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-paper">
                {m.text}
              </div>
            );
          }
          if (m.pendingId) {
            const p = view.pendings?.[m.pendingId];
            if (p) return <PendingCard key={`${m.id}:${JSON.stringify(p).length}`} pending={p} state={state} onAction={(b) => onAction(m.pendingId, b)} />;
            return (
              <div key={m.id} className="mr-8 rounded-2xl rounded-bl-md border border-hair bg-surface px-3 py-2 text-sm text-ink-faint">
                ⌛ Esta confirmación ya no está disponible.
              </div>
            );
          }
          return (
            <div key={m.id} className="mr-8 rounded-2xl rounded-bl-md border border-hair bg-surface px-3 py-2 text-sm text-ink">
              <RichText text={m.text} />
            </div>
          );
        })}

        {sending && (
          <>
            <div className="ml-8 rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-paper opacity-70">{sending}</div>
            <div className="mr-8 rounded-2xl rounded-bl-md border border-hair bg-surface px-3 py-2 text-sm">{typing}</div>
          </>
        )}
      </div>

      {netError && (
        <p className="pb-1 text-center text-xs text-warn">No me pude conectar. Revisá la conexión y probá de nuevo.</p>
      )}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
        <input
          className="flex-1 rounded-lg border border-hair px-3 py-3 text-base"
          placeholder="Un gasto o una pregunta…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={!text.trim() || Boolean(sending)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-paper disabled:opacity-40"
          aria-label="Enviar"
        >
          ➤
        </button>
      </form>
    </div>
  );
}
