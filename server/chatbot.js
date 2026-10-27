// Bot dentro de la app (pestaña Asistente): mismo flujo que el de Telegram
// (escribís un gasto → lo interpreta Claude → lo confirmás) más las preguntas
// sobre tus gastos, y los avisos de Mercado Pago llegan acá con una
// notificación push. Comparte las confirmaciones pendientes con Telegram
// (tabla tg_pending, ver pendingHooks en telegram.js): lo que resolvés en uno
// el otro lo ve resuelto.

import { randomUUID } from 'crypto';
import webpush from 'web-push';
import {
  getState, savePending, getPending, deletePending,
  getChatRow, putChatRow, getPushRow, putPushRow,
} from './supabase.js';
import {
  pendingHooks, parseExpense, commitExpense, buildMpPending, closeTelegramMessage,
  resumenText, groupName, fmt,
} from './telegram.js';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
export const pushConfigured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushConfigured) webpush.setVapidDetails('mailto:gastos@localhost', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
export const vapidPublicKey = VAPID_PUBLIC_KEY || null;

const MAX_MESSAGES = 200;

// La fila del chat se lee y escribe entera: una sola modificación a la vez
// (un aviso de MP puede caer justo mientras Pablo escribe).
let queue = Promise.resolve();
function withChat(fn) {
  const run = queue.then(async () => {
    const chat = (await getChatRow()) || { messages: [], activePendingId: null };
    const result = await fn(chat);
    chat.messages = chat.messages.slice(-MAX_MESSAGES);
    await putChatRow(chat);
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

const msg = (from, text, extra = {}) => ({ id: randomUUID().slice(0, 8), from, text, at: Date.now(), ...extra });

function resolveMessage(chat, pendingId, text) {
  const m = chat.messages.find((x) => x.pendingId === pendingId);
  if (m) {
    delete m.pendingId;
    m.text = text;
  }
  if (chat.activePendingId === pendingId) chat.activePendingId = null;
}

const money = (p) => (p.currency === 'USD' ? `US$ ${fmt(p.amount)}` : `$ ${fmt(p.amount)}`);

// --- Lo que ve la app ---

export async function getChatView() {
  const chat = (await getChatRow()) || { messages: [] };
  const messages = chat.messages.slice(-60);
  const ids = messages.filter((m) => m.pendingId).map((m) => m.pendingId);
  const pendings = {};
  await Promise.all(ids.map(async (id) => { pendings[id] = await getPending(id); }));
  return { messages, pendings };
}

// --- Mensaje escrito (o dictado) en la app ---

export async function handleChatText(text, askQuestion) {
  text = String(text || '').trim();
  if (!text) return getChatView();

  await withChat(async (chat) => {
    chat.messages.push(msg('me', text));
    const { data: state } = await getState();
    if (!state?.groups?.length) {
      chat.messages.push(msg('bot', 'Todavía no hay categorías cargadas.'));
      return;
    }
    if (/^\/?resumen$/i.test(text)) {
      chat.messages.push(msg('bot', resumenText(state)));
      return;
    }

    // Igual que en Telegram: si hay un gasto esperando confirmación, el
    // mensaje puede ser una corrección de ese ("no era de mel", "eran 25000").
    let pendingContext = null;
    if (chat.activePendingId) {
      pendingContext = await getPending(chat.activePendingId);
      if (!pendingContext?.amount) pendingContext = null; // peaje sin elegir de quién
      if (!pendingContext) chat.activePendingId = null;
    }

    let parsed;
    try {
      parsed = await parseExpense(text, state, pendingContext, { allowQuestion: true });
    } catch (err) {
      console.error('chat parseExpense:', err.message);
      chat.messages.push(msg('bot', 'Uf, algo falló procesando eso. Probá de nuevo en un rato.'));
      return;
    }

    if (parsed.isQuestion) {
      chat.messages.push(msg('bot', await askQuestion(text, state), { answer: true }));
      return;
    }
    if (pendingContext?.mp && parsed.isCorrection) parsed.amount ||= pendingContext.amount;
    if (!parsed.confident || !parsed.amount) {
      chat.messages.push(msg('bot', 'No pude sacar el monto o no entendí bien. Probá algo como "gasté 5000 en nafta", o preguntame "¿cuánto gasté este mes?".'));
      return;
    }
    const isCorrection = Boolean(pendingContext && parsed.isCorrection);
    delete parsed.isCorrection;
    delete parsed.isQuestion;

    if (isCorrection) {
      const updated = { ...parsed, originalText: pendingContext.originalText, messageId: pendingContext.messageId ?? null };
      // Los de Mercado Pago conservan monto, moneda y fecha reales del pago.
      if (pendingContext.mp) {
        Object.assign(updated, { mp: pendingContext.mp, amount: pendingContext.amount, currency: pendingContext.currency });
      }
      await savePending(chat.activePendingId, updated);
      chat.messages.push(msg('bot', 'Listo, lo corregí 👆'));
      return;
    }

    const id = randomUUID().slice(0, 8);
    await savePending(id, { ...parsed, originalText: text, messageId: null });
    chat.messages.push(msg('bot', '', { pendingId: id }));
    chat.activePendingId = id;
  });
  return getChatView();
}

// --- Botones de la tarjeta de confirmación ---
// body: { action: 'save'|'cancel'|'person', groupId?, subcategoryId? ('new'|'none'|id), who? ('me'|'mel') }

export async function handleChatAction(id, body = {}) {
  let changed = false;
  await withChat(async (chat) => {
    const pending = await getPending(id);
    if (!pending) {
      resolveMessage(chat, id, '⌛ Esta confirmación ya no está disponible.');
      return;
    }

    if (body.action === 'cancel') {
      await deletePending(id);
      resolveMessage(chat, id, `❌ Cancelado${pending.amount ? `: ${money(pending)} — ${pending.description}` : '.'}`);
      await closeTelegramMessage(pending.messageId, '❌ Cancelado desde la app.').catch(() => {});
      return;
    }

    if (body.action === 'person') {
      const { data: state } = await getState();
      const pend = await buildMpPending(pending.mp, state, body.who === 'mel' ? 'Mel' : null);
      await savePending(id, { ...pend, messageId: pending.messageId ?? null });
      chat.activePendingId = id;
      return;
    }

    if (body.action !== 'save' || !pending.amount) return;

    if (body.groupId) {
      pending.groupId = body.groupId;
      pending.newGroupName = null;
      const sub = body.subcategoryId;
      pending.subcategoryId = sub && sub !== 'new' && sub !== 'none' ? sub : null;
      pending.newSubcategoryName = sub === 'new' ? pending.description : null;
    }

    if (pending.mp?.test) {
      await deletePending(id);
      resolveMessage(chat, id, `🧪 Prueba OK — ${money(pending)} — ${pending.description}. No se cargó nada.`);
      await closeTelegramMessage(pending.messageId, '🧪 Prueba resuelta desde la app.').catch(() => {});
      return;
    }

    const { groupId, subcategoryId, state } = await commitExpense(pending, 'app-chat');
    await deletePending(id);
    changed = true;
    const g = groupName(state, groupId) || 'sin categoría';
    const subName = state.subcategories.find((s) => s.id === subcategoryId)?.name || '';
    const line = `✅ Guardado: ${money(pending)} — ${pending.description}\n${g}${subName ? ' › ' + subName : ''}`;
    resolveMessage(chat, id, line);
    await closeTelegramMessage(pending.messageId, `${line}\n_(desde la app)_`).catch(() => {});
  });
  return { ...(await getChatView()), changed };
}

// --- Web Push ---

export async function addPushSubscription(sub) {
  if (!sub?.endpoint) throw new Error('Suscripción inválida');
  const row = (await getPushRow()) || { subs: [] };
  row.subs = [...row.subs.filter((s) => s.endpoint !== sub.endpoint), sub];
  await putPushRow(row);
}

// Último envío, para diagnosticar desde /api/push/key (sin datos personales).
export const lastPush = { at: null, subs: 0, sent: 0, errors: [] };

export async function pushSubCount() {
  return ((await getPushRow())?.subs || []).length;
}

export async function sendPush(payload) {
  if (!pushConfigured) return 0;
  const row = (await getPushRow()) || { subs: [] };
  let sent = 0;
  const errors = [];
  const dead = new Set();
  await Promise.all(row.subs.map(async (sub) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' });
      sent++;
    } catch (err) {
      errors.push(`${err.statusCode || ''} ${err.message}`.trim().slice(0, 200));
      if (err.statusCode === 404 || err.statusCode === 410) dead.add(sub.endpoint);
      else console.error('push:', err.statusCode || '', err.message);
    }
  }));
  if (dead.size) await putPushRow({ subs: row.subs.filter((s) => !dead.has(s.endpoint)) });
  Object.assign(lastPush, { at: new Date().toISOString(), subs: row.subs.length, sent, errors });
  return sent;
}

// --- Enganche con los avisos de Mercado Pago y con Telegram ---

pendingHooks.created = async (id, pend) => {
  await withChat(async (chat) => {
    chat.messages.push(msg('bot', '', { pendingId: id }));
    chat.activePendingId = id;
  });
  const o = pend.mp;
  const what = o.toll ? `🚗 Peaje ${money(o)} — ¿de quién es?` : `${money(pend)} — ${pend.description}`;
  // Ya quedó en el chat: si la push falla no se reintenta (duplicaría la tarjeta).
  await sendPush({
    title: `${o.test ? '🧪 PRUEBA · ' : ''}💸 Gasto en Mercado Pago`,
    body: `${what}\nTocá para confirmarlo`,
    tag: id,
  }).catch((err) => console.error('push MP:', err.message));
  return true;
};

pendingHooks.resolved = (id, text) => withChat(async (chat) => resolveMessage(chat, id, text));
