// Detección de egresos de Mercado Pago: cada tanto se buscan los pagos que
// hizo Pablo (como pagador) y por cada uno nuevo el bot de Telegram pregunta
// si cargarlo. Solo lee — nunca crea ni toca nada en Mercado Pago.
//
// Qué devuelve MP (verificado con la cuenta real, 2026-10-26): cada pasada de
// peaje TelePASE llega como un pago aparte, SIN patente (solo monto, hora y
// cabina) — por eso para los peajes el bot pregunta de quién es el auto.
// Transferencias llegan como "Varios" sin el nombre del destinatario.

import { getSeenRow, putSeenRow } from './supabase.js';
import { todayAR } from './time.js';

const TOKEN = process.env.MP_ACCESS_TOKEN;
export const mpConfigured = Boolean(TOKEN);

const MAX_SEEN = 500;

async function mp(path) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// El access token de producción termina en "-<user_id>"; si no, se le pregunta a MP.
let userId = TOKEN?.match(/-(\d+)$/)?.[1] || null;
async function getUserId() {
  if (!userId) userId = String((await mp('/users/me')).id);
  return userId;
}

export const isToll = (p) =>
  /toll/i.test(p.point_of_interaction?.business_info?.branch || '') ||
  /TELEPASE/i.test(p.idempotency_key || '');

// Texto corto para mostrar y para que Claude sugiera la categoría.
function describe(p) {
  if (isToll(p)) return 'Peaje';
  if (p.operation_type === 'money_transfer') return 'Transferencia';
  const d = (p.description || p.additional_info?.items?.[0]?.title || '').trim();
  if (!d) return 'Pago Mercado Pago';
  return d
    .replace(/^dlo\*/i, '')
    .replace(/^producto de /i, '')
    .slice(0, 60);
}

// Fecha del pago en hora argentina (MP la manda con offset -04:00).
function dateAR(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return todayAR();
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
}

function isOutflow(p) {
  if (p.status !== 'approved') return false;
  if (p.operation_type === 'account_fund') return false; // plata que entra a la cuenta
  if ((p.transaction_amount_refunded || 0) >= p.transaction_amount) return false;
  return p.transaction_amount > 0;
}

export async function fetchRecentOutflows() {
  const id = await getUserId();
  const data = await mp(`/v1/payments/search?payer.id=${id}&sort=date_created&criteria=desc&limit=50`);
  return (data.results || []).filter(isOutflow).map((p) => ({
    mpId: String(p.id),
    createdAt: p.date_created,
    amount: Math.round(p.transaction_amount * 100) / 100,
    currency: p.currency_id === 'USD' ? 'USD' : 'ARS',
    description: describe(p),
    toll: isToll(p),
    date: dateAR(p.date_created),
  }));
}

// Devuelve los egresos que todavía no se avisaron (del más viejo al más
// nuevo). `markSeen(mpId)` hay que llamarlo después de avisar cada uno.
// La primera vez que corre solo guarda la línea de base (no avisa los ~1800
// pagos históricos).
let running = false;
export async function checkNewOutflows(notify) {
  if (!mpConfigured || running) return { skipped: true };
  running = true;
  try {
    const outflows = await fetchRecentOutflows();
    let seen = await getSeenRow();
    if (!seen) {
      seen = { since: new Date().toISOString(), ids: outflows.map((o) => o.mpId) };
      await putSeenRow(seen);
      return { baseline: true, count: outflows.length };
    }
    const seenIds = new Set(seen.ids);
    const since = new Date(seen.since);
    const fresh = outflows
      .filter((o) => !seenIds.has(o.mpId) && new Date(o.createdAt) >= since)
      .reverse();

    let notified = 0;
    for (const o of fresh) {
      try {
        await notify(o);
        notified++;
      } catch (err) {
        console.error(`No se pudo avisar el pago MP ${o.mpId}:`, err.message);
        continue; // se reintenta en la próxima vuelta
      }
      seen.ids.push(o.mpId);
    }
    seen.ids = seen.ids.slice(-MAX_SEEN);
    if (notified) await putSeenRow(seen);
    return { notified, fresh: fresh.length };
  } finally {
    running = false;
  }
}

// Diagnóstico: campos de monto y fecha de los últimos egresos, tal como los
// manda MP (para ver qué campo trae el monto realmente debitado).
export async function debugRecentPayments(limit = 10) {
  const id = await getUserId();
  const data = await mp(`/v1/payments/search?payer.id=${id}&sort=date_created&criteria=desc&limit=${limit}`);
  return (data.results || []).map((p) => ({
    id: p.id,
    status: p.status,
    status_detail: p.status_detail,
    operation_type: p.operation_type,
    payment_type_id: p.payment_type_id,
    description: p.description,
    date_created: p.date_created,
    date_approved: p.date_approved,
    currency_id: p.currency_id,
    transaction_amount: p.transaction_amount,
    taxes_amount: p.taxes_amount,
    transaction_details: p.transaction_details,
    fee_details: p.fee_details,
    taxes: p.taxes,
    charges_details: p.charges_details?.map((c) => ({ name: c.name, type: c.type, amounts: c.amounts })),
    currency_conversion: p.currency_conversion ?? p.additional_info?.currency_conversion,
  }));
}
