// Bot de Telegram: cargar gastos escribiéndole al bot en lenguaje natural.
// Flujo: mensaje -> Claude lo interpreta -> el bot responde con lo que
// entendió + botones -> al confirmar, se escribe en el estado (Supabase).

import { randomUUID } from 'crypto';
import { getState, putState, savePending, getPending, deletePending } from './supabase.js';
import { getDolarBlue } from './dolar.js';
import { sendWeeklyReport } from './report.js';
import { todayAR } from './time.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

export const telegramConfigured = Boolean(BOT_TOKEN && CHAT_ID && WEBHOOK_SECRET);

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

// Id de la confirmación pendiente más reciente (bot de un solo usuario: no
// hace falta más que esto para saber "de qué gasto está hablando" si el
// próximo mensaje no aprieta un botón sino que corrige algo por texto). Vive
// en memoria: si el server se reinicia se pierde, y un mensaje que en
// realidad era una corrección se trata como gasto nuevo — degradación
// aceptable, no rompe nada.
let activePendingId = null;

async function tg(method, body) {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) console.error(`Telegram ${method} falló:`, data.description);
  return data;
}

const send = (text, extra = {}) =>
  tg('sendMessage', { chat_id: CHAT_ID, text, parse_mode: 'Markdown', ...extra });

const editText = (messageId, text, extra = {}) =>
  tg('editMessageText', { chat_id: CHAT_ID, message_id: messageId, text, parse_mode: 'Markdown', ...extra });

// --- Interpretación del mensaje con Claude ---

async function parseExpense(text, state, pendingContext = null) {
  const grupos = state.groups.map((g) => ({ id: g.id, nombre: g.name }));
  const subs = state.subcategories.map((s) => ({ id: s.id, grupoId: s.groupId, nombre: s.name }));
  const today = todayAR();

  const schemaFields =
    '{"amount": number, "currency": "ARS"|"USD", "groupId": string|null, ' +
    '"newGroupName": string|null, "subcategoryId": string|null, "newSubcategoryName": string|null, ' +
    '"description": string, "personName": string|null, "confident": boolean' +
    (pendingContext ? ', "isCorrection": boolean' : '') +
    '}';

  let system =
    'Interpretás un gasto que un usuario argentino escribió en lenguaje natural y ' +
    'devolvés SOLO un JSON válido, sin texto alrededor, con esta forma exacta:\n' +
    `${schemaFields}\n\n` +
    'Reglas:\n' +
    '- "amount": el número. "15 lucas"/"15 mil" = 15000, "2 palos"/"2 millones" = 2000000.\n' +
    '- "currency": "USD" solo si menciona dólares/usd/u$s, si no "ARS".\n' +
    '- "groupId": elegí SIEMPRE el grupo existente que mejor encaje. Comida, super, ' +
    'verdulería, farmacia, servicios y cualquier gasto del hogar van en el grupo tipo ' +
    '"Vivienda". Bares, delivery, cine, juntadas van en el grupo tipo "Salidas/Ocio". ' +
    'Solo dejá groupId null y poné "newGroupName" si de verdad no entra en NINGÚN grupo ' +
    'existente (ej: un rubro totalmente aparte como un auto o un local comercial).\n' +
    '- Para la subcategoría: si hay una existente de ese grupo que encaje, usá su "subcategoryId". ' +
    'Si no, dejá subcategoryId null y poné "newSubcategoryName" con un nombre corto y prolijo.\n' +
    '- "description": 1 a 3 palabras, lo más parecido posible a lo que escribió el usuario.\n' +
    '- "personName": SOLO si el mensaje nombra explícitamente una persona distinta del ' +
    'usuario ("de Juan", "para Ana", "el psicólogo de Caro", "regalo de mamá"), poné ese ' +
    'nombre EXACTO tal cual aparece en el mensaje. Si el mensaje no menciona ninguna ' +
    'persona, "personName" DEBE ser null. Nunca copies un nombre de estas instrucciones ' +
    'ni de ningún otro lado: el nombre tiene que estar escrito, literalmente, en el ' +
    'mensaje del usuario.\n' +
    '- "confident": false si no pudiste sacar un monto o el mensaje es ambiguo.\n';

  if (pendingContext) {
    const { messageId: _messageId, originalText: _originalText, isCorrection: _isCorrection, ...prevFields } = pendingContext;
    system +=
      '\nHay un gasto que el usuario escribió hace un momento y TODAVÍA NO CONFIRMÓ (se lo ' +
      'mostré con botones, está esperando que apriete uno):\n' +
      `${JSON.stringify(prevFields)}\n\n` +
      'El mensaje nuevo puede ser (a) una corrección o aclaración de ESE MISMO gasto — cambia ' +
      'el monto, la moneda, la categoría, el nombre, la descripción, o pide sacar/agregar algo ' +
      '(ej "no, eran 25000", "no era de mel", "va en super", "sacale el nombre", "en dólares") ' +
      '— o (b) la descripción de un gasto totalmente distinto y nuevo, sin relación con el de ' +
      'arriba. Si es (a): devolvé el gasto COMPLETO ya corregido, repitiendo tal cual los campos ' +
      'que no cambiaron (incluido el "amount" si no lo corrigió), y poné "isCorrection": true. ' +
      'Si es (b): interpretalo como un gasto nuevo de cero, ignorando el de arriba, y poné ' +
      '"isCorrection": false.\n';
  }

  system += `\nHoy es ${today}.\nGRUPOS: ${JSON.stringify(grupos)}\nSUBCATEGORIAS: ${JSON.stringify(subs)}`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const raw = data.content?.[0]?.text?.trim() || '';
  const json = raw.replace(/^```json\s*|\s*```$/g, '');
  return JSON.parse(json);
}

// --- Helpers de presentación ---

function groupName(state, id) {
  return state.groups.find((g) => g.id === id)?.name || null;
}

function describePending(state, p) {
  const money = p.currency === 'USD' ? `US$ ${fmt(p.amount)}` : `$ ${fmt(p.amount)}`;
  const g = p.newGroupName ? `${p.newGroupName} (nueva)` : groupName(state, p.groupId) || 'sin categoría';
  let sub = '';
  if (p.newSubcategoryName) sub = ` › ${p.newSubcategoryName} (nueva)`;
  else if (p.subcategoryId) {
    const s = state.subcategories.find((x) => x.id === p.subcategoryId);
    if (s) sub = ` › ${s.name}`;
  }
  const persona = p.personName ? `\nNombre: *${p.personName}*` : '';
  return `📝 *${money}* — ${p.description}\nCategoría: *${g}${sub}*${persona}`;
}

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0);
}

const confirmKeyboard = (id) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Guardar', callback_data: `sv:${id}` }],
      [
        { text: '📁 Otra categoría', callback_data: `cat:${id}` },
        { text: '❌ Cancelar', callback_data: `cx:${id}` },
      ],
    ],
  },
});

// --- Aplicar el gasto al estado ---

async function commitExpense(p) {
  const { data: state } = await getState();
  if (!state || !state.groups) throw new Error('No hay estado en la base');
  state.expenses = state.expenses || [];
  state.subcategories = state.subcategories || [];

  let groupId = p.groupId;
  if (p.newGroupName && !groupId) {
    groupId = randomUUID();
    state.groups.push({ id: groupId, name: p.newGroupName, color: '#0891b2' });
  }
  let subcategoryId = p.subcategoryId;
  if (p.newSubcategoryName && groupId) {
    subcategoryId = randomUUID();
    state.subcategories.push({ id: subcategoryId, groupId, name: p.newSubcategoryName });
  }

  let amount = p.amount;
  let amountOriginal = null;
  let fxRate = null;
  if (p.currency === 'USD') {
    const blue = await getDolarBlue();
    fxRate = blue?.promedio || blue?.venta || state.config?.fxRate || null;
    amountOriginal = p.amount;
    amount = fxRate ? p.amount * fxRate : p.amount;
  }

  state.expenses.push({
    id: randomUUID(),
    amount,
    currency: p.currency || 'ARS',
    amountOriginal,
    fxRate,
    groupId: groupId || null,
    subcategoryId: subcategoryId || null,
    description: p.description || '(sin descripción)',
    personName: p.personName?.trim() || null,
    date: todayAR(),
    type: 'variable',
    inputMethod: 'telegram',
    recurringId: null,
    createdAt: Date.now(),
  });

  await putState(state);
  return { state, groupId, subcategoryId };
}

// --- Handlers ---

async function handleMessage(msg) {
  const text = (msg.text || '').trim();
  if (!text) return;

  if (text.startsWith('/')) {
    const cmd = text.split(/\s+/)[0].toLowerCase();
    if (cmd === '/start' || cmd === '/help') {
      await send(
        'Escribime un gasto como si le contaras a alguien y lo cargo:\n\n' +
          '· _gasté 15 mil en el super_\n' +
          '· _pagué 8000 de nafta_\n' +
          '· _120 dólares de una campera_\n\n' +
          'Te muestro lo que entendí y confirmás con un botón. Si la categoría no existe, la creo. ' +
          'Si algo salió mal, antes de tocar un botón escribime la corrección ' +
          '(ej: _"no era de mel"_, _"eran 25000"_, _"va en super"_) y lo actualizo en el mismo mensaje.\n\n' +
          'Escribí */resumen* cuando quieras para ver cómo venís.'
      );
    } else if (cmd === '/resumen') {
      try {
        await sendWeeklyReport();
      } catch (e) {
        console.error('resumen imagen falló, mando texto:', e.message);
        await sendResumen();
      }
    } else {
      await send('No conozco ese comando. Escribime un gasto directamente.');
    }
    return;
  }

  try {
    const { data: state } = await getState();
    if (!state || !state.groups?.length) {
      return send('Abrí la app una vez (gastos-app-396i.onrender.com) para que se sincronicen tus categorías y después escribime el gasto.');
    }

    // Si hay una confirmación pendiente, le pasamos ese contexto: el mensaje
    // nuevo puede ser una corrección de ESE gasto ("no era de mel", "eran
    // 25000") en vez de uno nuevo — parseExpense decide cuál es.
    let pendingContext = null;
    if (activePendingId) {
      pendingContext = await getPending(activePendingId);
      if (!pendingContext) activePendingId = null;
    }

    const parsed = await parseExpense(text, state, pendingContext);
    if (!parsed.confident || !parsed.amount) {
      return send('No pude sacar el monto o no entendí bien. Probá algo como "gasté 5000 en nafta".');
    }
    const isCorrection = Boolean(pendingContext && parsed.isCorrection);
    delete parsed.isCorrection;

    if (isCorrection) {
      const updated = { ...parsed, originalText: pendingContext.originalText, messageId: pendingContext.messageId };
      await savePending(activePendingId, updated);
      if (updated.messageId) {
        await editText(updated.messageId, describePending(state, updated), confirmKeyboard(activePendingId));
      } else {
        await send(describePending(state, updated), confirmKeyboard(activePendingId));
      }
      return;
    }

    const id = randomUUID().slice(0, 8);
    const sent = await send(describePending(state, parsed), confirmKeyboard(id));
    await savePending(id, { ...parsed, originalText: text, messageId: sent?.result?.message_id ?? null });
    activePendingId = id;
  } catch (err) {
    console.error('Error procesando mensaje de Telegram:', err.message);
    await send('Uf, algo falló procesando eso. Probá de nuevo en un rato.');
  }
}

async function handleCallback(cb) {
  const data = cb.data || '';
  const messageId = cb.message?.message_id;
  const [action, id, arg] = data.split(':');

  const ack = (text) => tg('answerCallbackQuery', { callback_query_id: cb.id, text });

  const pending = await getPending(id);
  if (!pending) {
    if (activePendingId === id) activePendingId = null;
    await ack('Esa confirmación ya no está disponible.');
    if (messageId) await editText(messageId, '⌛ Esta confirmación venció. Mandá el gasto de nuevo.');
    return;
  }

  const { data: state } = await getState();

  if (action === 'cx') {
    await deletePending(id);
    if (activePendingId === id) activePendingId = null;
    await ack('Cancelado');
    return editText(messageId, '❌ Cancelado.');
  }

  if (action === 'sv') {
    try {
      const { groupId, subcategoryId } = await commitExpense(pending);
      await deletePending(id);
      if (activePendingId === id) activePendingId = null;
      await ack('Guardado ✅');
      const g = groupName(state, groupId) || pending.newGroupName || 'sin categoría';
      const money = pending.currency === 'USD' ? `US$ ${fmt(pending.amount)}` : `$ ${fmt(pending.amount)}`;
      const subName =
        pending.newSubcategoryName ||
        state.subcategories.find((s) => s.id === subcategoryId)?.name ||
        '';
      return editText(messageId, `✅ Guardado: *${money}* — ${pending.description}\n${g}${subName ? ' › ' + subName : ''}`);
    } catch (err) {
      console.error('Error guardando gasto de Telegram:', err.message);
      await ack('No se pudo guardar');
      return editText(messageId, '⚠️ No se pudo guardar. Probá de nuevo.');
    }
  }

  if (action === 'cat') {
    await ack();
    const rows = state.groups.map((g) => [{ text: g.name, callback_data: `cg:${id}:${g.id}` }]);
    rows.push([{ text: '❌ Cancelar', callback_data: `cx:${id}` }]);
    return editText(messageId, `${describePending(state, pending)}\n\n¿En qué categoría va?`, {
      reply_markup: { inline_keyboard: rows },
    });
  }

  if (action === 'cg') {
    await ack();
    const groupId = arg;
    pending.groupId = groupId;
    pending.newGroupName = null;
    pending.subcategoryId = null;
    await savePending(id, pending);
    const subs = state.subcategories.filter((s) => s.groupId === groupId);
    const rows = subs.map((s) => [{ text: s.name, callback_data: `cs:${id}:${s.id}` }]);
    rows.push([{ text: `➕ Nueva: ${pending.description}`.slice(0, 60), callback_data: `cs:${id}:new` }]);
    rows.push([{ text: '💾 Sin subcategoría', callback_data: `cs:${id}:none` }]);
    return editText(messageId, `${describePending(state, pending)}\n\nElegí la subcategoría:`, {
      reply_markup: { inline_keyboard: rows },
    });
  }

  if (action === 'cs') {
    if (arg === 'new') {
      pending.subcategoryId = null;
      pending.newSubcategoryName = pending.description;
    } else if (arg === 'none') {
      pending.subcategoryId = null;
      pending.newSubcategoryName = null;
    } else {
      pending.subcategoryId = arg;
      pending.newSubcategoryName = null;
    }
    try {
      const { groupId, subcategoryId, state: newState } = await commitExpense(pending);
      await deletePending(id);
      if (activePendingId === id) activePendingId = null;
      await ack('Guardado ✅');
      const g = groupName(newState, groupId) || 'sin categoría';
      const money = pending.currency === 'USD' ? `US$ ${fmt(pending.amount)}` : `$ ${fmt(pending.amount)}`;
      const subName =
        newState.subcategories.find((s) => s.id === subcategoryId)?.name || '';
      return editText(messageId, `✅ Guardado: *${money}* — ${pending.description}\n${g}${subName ? ' › ' + subName : ''}`);
    } catch (err) {
      console.error('Error guardando gasto (subcategoría) de Telegram:', err.message);
      await ack('No se pudo guardar');
      return editText(messageId, '⚠️ No se pudo guardar. Probá de nuevo.');
    }
  }
}

// Resumen rápido del mes (se puede pedir con /resumen o mandarlo por cron)
export async function sendResumen() {
  const { data: state } = await getState();
  if (!state || !state.groups) return send('Todavía no hay datos cargados.');
  const mk = todayAR().slice(0, 7);
  const inMonth = (d) => (d || '').slice(0, 7) === mk;
  const gastos = state.expenses.filter((e) => inMonth(e.date));
  const ingresos = state.incomes.filter((i) => inMonth(i.date));
  const totGasto = gastos.reduce((s, e) => s + e.amount, 0);
  const totIngreso = ingresos.reduce((s, i) => s + i.amount, 0);
  const extrasId = state.config?.extrasGroupId;
  const extras = gastos.filter((e) => e.groupId === extrasId).reduce((s, e) => s + e.amount, 0);
  const budget = state.config?.extrasBudget;
  const goal = state.config?.savingsGoal;

  let txt = `📊 *Resumen del mes*\n\nIngresos: $ ${fmt(totIngreso)}\nGastos: $ ${fmt(totGasto)}\nAhorro: $ ${fmt(totIngreso - totGasto)}`;
  if (budget) {
    const pct = Math.round((extras / budget) * 100);
    txt += `\n\nSalidas: $ ${fmt(extras)} de $ ${fmt(budget)} (${pct}%)`;
  }
  if (goal) {
    txt += `\nMeta de ahorro: $ ${fmt(goal)} — vas $ ${fmt(totIngreso - totGasto)}`;
  }
  await send(txt);
}

// Router del webhook. Devuelve siempre rápido (Telegram reintenta si tarda).
export async function handleUpdate(update) {
  try {
    if (update.message) {
      if (String(update.message.chat?.id) !== String(CHAT_ID)) return;
      await handleMessage(update.message);
    } else if (update.callback_query) {
      if (String(update.callback_query.message?.chat?.id) !== String(CHAT_ID)) return;
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error('handleUpdate error:', err.message);
  }
}

export function verifyWebhook(req) {
  return req.get('X-Telegram-Bot-Api-Secret-Token') === WEBHOOK_SECRET;
}
