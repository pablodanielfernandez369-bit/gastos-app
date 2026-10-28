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

async function mp(path, opts = {}) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...opts.headers },
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
  return (data.results || []).filter(isOutflow).map((p) => {
    // Lo que salió de la cuenta: con la prepaga incluye el "cards_spread" de
    // MP (~10%), y con cupón es menos que transaction_amount.
    const paid = p.transaction_details?.total_paid_amount || p.transaction_amount;
    // Los débitos de suscripciones (ej. Anthropic) se crean un día y se
    // aprueban otro; cuenta el día en que se cobró.
    const when = p.date_approved || p.date_created;
    return {
      mpId: String(p.id),
      createdAt: when,
      amount: Math.round(paid * 100) / 100,
      currency: p.currency_id === 'USD' ? 'USD' : 'ARS',
      description: describe(p),
      toll: isToll(p),
      date: dateAR(when),
    };
  });
}

// Transferencias a cuentas bancarias (CBU/CVU de otro banco): NO aparecen en
// /v1/payments/search, pero sí en el reporte "Dinero en cuenta" (release
// report) como filas "payout". El reporte se pide y MP tarda ~5-10 min en
// armarlo, así que se pide uno cada REPORT_EVERY_MS (últimas 24 h) y se lee
// el más nuevo que esté listo.
const REPORT_EVERY_MS = 10 * 60 * 1000;
let lastReportRequest = 0;
let lastReportFile = null;
let reportPayouts = [];

export function parseReportPayouts(csv) {
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(';');
  const idx = (k) => cols.indexOf(k);
  return rows
    .map((line) => line.split(';'))
    .filter((r) => r[idx('DESCRIPTION')] === 'payout' && Number(r[idx('NET_DEBIT_AMOUNT')]) > 0)
    .map((r) => {
      const when = r[idx('DATE')];
      return {
        mpId: `payout:${r[idx('SOURCE_ID')]}`,
        createdAt: when,
        amount: Math.round(Number(r[idx('NET_DEBIT_AMOUNT')]) * 100) / 100,
        currency: 'ARS',
        description: 'Transferencia a cuenta bancaria',
        toll: false,
        date: dateAR(when),
      };
    });
}

async function refreshReportPayouts() {
  try {
    const files = await mp('/v1/account/release_report/list');
    const newest = (Array.isArray(files) ? files : [])
      .filter((f) => f.file_name && f.created_from === 'manual')
      .sort((a, b) => new Date(b.date_created) - new Date(a.date_created))[0];
    if (newest && newest.file_name !== lastReportFile) {
      const res = await fetch(`https://api.mercadopago.com/v1/account/release_report/${newest.file_name}`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (!res.ok) throw new Error(`reporte ${res.status}`);
      reportPayouts = parseReportPayouts(await res.text());
      lastReportFile = newest.file_name;
    }
    if (Date.now() - lastReportRequest > REPORT_EVERY_MS) {
      lastReportRequest = Date.now();
      const end = new Date();
      const begin = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      const iso = (d) => d.toISOString().replace(/\.\d+Z$/, 'Z');
      await mp('/v1/account/release_report', {
        method: 'POST',
        body: JSON.stringify({ begin_date: iso(begin), end_date: iso(end) }),
      });
    }
  } catch (err) {
    console.error('MP reporte:', err.message);
  }
  return reportPayouts;
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
    const outflows = [...(await fetchRecentOutflows()), ...(await refreshReportPayouts())].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
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

// Diagnóstico de los reportes de cuenta (/v1/account/...): devuelve status y
// cuerpo crudo, para probar qué permite el token.
export async function accountReportRaw(method, path, body) {
  if (!path.startsWith('/v1/account/')) throw new Error('solo /v1/account/');
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.text()).slice(0, 20000) };
}
