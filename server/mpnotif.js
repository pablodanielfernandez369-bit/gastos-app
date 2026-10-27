// Notificaciones de Mercado Pago reenviadas por la app de Android de Pablo
// (carpeta mpnotif-android). Cubre lo que la API de MP no ve: las compras con
// la Mastercard prepaga (ej. los débitos de Claude) no aparecen en
// /v1/payments/search, pero la notificación del celular llega siempre.
//
// Para no avisar dos veces lo mismo, se espera un rato y se fija si el pago
// ya está en la API de MP: si está, lo avisa el polling de siempre (que además
// tiene el flujo especial de peajes); si no, lo avisa este módulo.

import { createHash } from 'crypto';
import { fetchRecentOutflows, mpConfigured } from './mercadopago.js';
import { todayAR } from './time.js';
import { getNotifLogRow, putNotifLogRow, supabaseConfigured } from './supabase.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

// sha256 de la clave que lleva la app de Android (la clave en sí no está en el repo).
const KEY_HASH = 'b35d585e714035838c22b7bb8cb6cd3093e516fe228d7833cdf0fd29db819afb';
export const validNotifKey = (key) =>
  typeof key === 'string' && createHash('sha256').update(key).digest('hex') === KEY_HASH;

const WAIT_MS = 2 * 60 * 1000;
const MATCH_WINDOW_MS = 15 * 60 * 1000;
const seen = new Map(); // hash del texto -> cuándo llegó
export const lastNotifs = []; // últimas recibidas, para ver el formato real

// Lo mismo pero guardado en la base (sobrevive a los reinicios), con el
// resultado de cada una: así se puede ver por qué alguna no avisó.
const LOG_MAX = 50;
let logQueue = Promise.resolve();
function logNotif(hash, fields) {
  if (!supabaseConfigured) return;
  logQueue = logQueue
    .then(async () => {
      const log = (await getNotifLogRow()) || [];
      const entry = log.find((e) => e.hash === hash && !e.done);
      if (entry) Object.assign(entry, fields);
      else log.unshift({ hash, ...fields });
      await putNotifLogRow(log.slice(0, LOG_MAX));
    })
    .catch((err) => console.error('mp-notif log:', err.message));
}
export const getNotifLog = async () => (supabaseConfigured ? (await getNotifLogRow()) || [] : lastNotifs);

// Claude decide si la notificación es plata que sale y saca monto/comercio.
async function parseNotif(title, text) {
  const system =
    'Te paso una notificación del celular de la app Mercado Pago (Argentina). Decidí si es ' +
    'un EGRESO de plata del usuario: un pago, una compra con tarjeta (incluida la prepaga), un ' +
    'débito automático, una transferencia enviada, un pago de servicio. NO son egresos: plata ' +
    'recibida, ingresos, rendimientos, promociones, recordatorios, ofertas, avisos de seguridad, ' +
    'pagos rechazados o pendientes. Devolvé SOLO un JSON: {"egreso": boolean, "amount": number|null, ' +
    '"currency": "ARS"|"USD", "comercio": string|null}. "amount" en número (33.675,22 = 33675.22). ' +
    '"comercio": a quién se pagó, corto (ej "Claude Ai", "Transferencia a Melina").';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: `Título: ${title}\nTexto: ${text}` }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const raw = data.content?.find((b) => b.type === 'text')?.text || '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`Sin JSON: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(start, end + 1));
}

function dateAR(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(ms));
}

async function alreadyInApi(amount, at) {
  if (!mpConfigured) return false;
  const outflows = await fetchRecentOutflows();
  return outflows.some(
    (o) => Math.abs(o.amount - amount) < 0.01 && Math.abs(new Date(o.createdAt).getTime() - at) < MATCH_WINDOW_MS
  );
}

// Egresos ya avisados desde una notificación. El polling de la API lo consulta
// antes de avisar, por si el pago aparece en la API recién después de la espera.
const notified = [];
export function wasNotified(amount, at) {
  while (notified.length && Date.now() - notified[0].at > 2 * 60 * 60 * 1000) notified.shift();
  return notified.some((n) => Math.abs(n.amount - amount) < 0.01 && Math.abs(n.at - at) < MATCH_WINDOW_MS);
}

// Devuelve enseguida; el aviso por Telegram sale después de la espera.
export function handleNotif({ title = '', text = '', postTime, test }, notify) {
  const at = Number(postTime) || Date.now();
  const hash = createHash('sha256').update(`${title}|${text}`).digest('hex').slice(0, 16);

  lastNotifs.unshift({ title, text, at: new Date(at).toISOString() });
  lastNotifs.length = Math.min(lastNotifs.length, 20);

  for (const [h, t] of seen) if (Date.now() - t > 60 * 60 * 1000) seen.delete(h);
  if (seen.has(hash)) return { duplicate: true };
  seen.set(hash, Date.now());
  logNotif(hash, { title, text, at: new Date(at).toISOString(), result: 'esperando' });
  const done = (result, extra) => logNotif(hash, { result, ...extra, done: true });

  setTimeout(async () => {
    try {
      const p = await parseNotif(title, text);
      if (!p.egreso || !p.amount) return done('no es egreso', { parsed: p });
      if (!test && (await alreadyInApi(p.amount, at))) return done('ya está en la API', { parsed: p });
      // MP y Mercado Libre pueden avisar la misma compra con textos distintos.
      if (!test && wasNotified(p.amount, at)) return done('repetida', { parsed: p });
      if (!test) notified.push({ amount: p.amount, at });
      await notify({
        mpId: `notif:${hash}`,
        createdAt: new Date(at).toISOString(),
        amount: Math.round(p.amount * 100) / 100,
        currency: p.currency === 'USD' ? 'USD' : 'ARS',
        description: (p.comercio || 'Pago Mercado Pago').slice(0, 60),
        toll: false,
        test: Boolean(test), // prueba: los botones no guardan
        date: at ? dateAR(at) : todayAR(),
      });
      done('avisada', { parsed: p });
    } catch (err) {
      console.error('mp-notif:', err.message);
      done('error', { error: err.message });
    }
  }, WAIT_MS);
  return { queued: true };
}
