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
const MODEL = 'claude-sonnet-5';

export const telegramConfigured = Boolean(BOT_TOKEN && CHAT_ID && WEBHOOK_SECRET);

const api = (method) => `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

// Id de la confirmación pendiente más reciente (bot de un solo usuario: no
// hace falta más que esto para saber "de qué gasto está hablando" si el
// próximo mensaje no aprieta un botón sino que corrige algo por texto). Vive
// en memoria: si el server se reinicia se pierde, y un mensaje que en
// realidad era una corrección se trata como gasto nuevo — degradación
// aceptable, no rompe nada.
let activePendingId = null;

// El chat de la app (server/chatbot.js) se engancha acá: comparte las mismas
// confirmaciones pendientes (tg_pending), así un aviso de MP se resuelve
// desde cualquiera de los dos lados y el otro se entera.
export const pendingHooks = { created: null, resolved: null };
const resolved = (id, text) =>
  Promise.resolve(pendingHooks.resolved?.(id, text)).catch((e) => console.error('pendingHooks.resolved:', e.message));

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

export async function parseExpense(text, state, pendingContext = null, { allowQuestion = false } = {}) {
  const grupos = state.groups.map((g) => ({ id: g.id, nombre: g.name }));
  const subs = state.subcategories.map((s) => ({ id: s.id, grupoId: s.groupId, nombre: s.name }));
  const today = todayAR();

  const schemaFields =
    '{"amount": number, "currency": "ARS"|"USD", "groupId": string|null, ' +
    '"newGroupName": string|null, "subcategoryId": string|null, "newSubcategoryName": string|null, ' +
    '"description": string, "personName": string|null, "confident": boolean' +
    (pendingContext ? ', "isCorrection": boolean' : '') +
    (allowQuestion ? ', "isQuestion": boolean' : '') +
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
    '- "confident": false si no pudiste sacar un monto o el mensaje es ambiguo.\n' +
    (allowQuestion
      ? '- "isQuestion": true si el mensaje NO es un gasto sino una pregunta o consulta sobre sus ' +
        'gastos, ingresos o ahorro (ej "cuánto gasté este mes", "cómo voy con el super", "subió la luz?"). ' +
        'En ese caso el resto de los campos no importa.\n'
      : '');

  if (pendingContext) {
    const { messageId: _messageId, originalText: _originalText, isCorrection: _isCorrection, mp, ...prevFields } = pendingContext;
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
    if (mp) {
      system +=
        'Ese gasto lo detecté solo en Mercado Pago (no lo escribió el usuario), así que el monto ' +
        'ya es el real. Un mensaje SIN monto que cuenta a quién, para qué o qué fue (ej "envié a ' +
        'mel", "era la luz", "regalo para mamá", "fue el super") es casi seguro una aclaración (a): ' +
        'usalo para la descripción, la categoría y el nombre, dejá el monto igual y poné ' +
        '"confident": true. Si nombra a una persona, va en "personName".\n';
    }
  }

  system += `\nHoy es ${today}.\nGRUPOS: ${JSON.stringify(grupos)}\nSUBCATEGORIAS: ${JSON.stringify(subs)}`;

  // Sonnet 5 puede "pensar" antes de responder y ese razonamiento cuenta para
  // max_tokens: con un tope chico (300) un mensaje ambiguo (ej "ayuda a papás")
  // se quedaba sin lugar para el JSON y volvía vacío. Tope holgado + 1 reintento.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
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
          messages: [{ role: 'user', content: text }],
        }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
      const data = await r.json();
      // No asumir que la respuesta está en content[0] (puede venir un bloque
      // "thinking" antes): buscar el bloque de texto real.
      const raw = data.content?.find((b) => b.type === 'text')?.text?.trim() || '';
      // Tomar el primer objeto JSON aunque venga con texto o ``` alrededor.
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end <= start) {
        throw new Error(`Sin JSON en la respuesta (stop_reason=${data.stop_reason}, bloques=${(data.content || []).map((b) => b.type).join(',')}): ${raw.slice(0, 200)}`);
      }
      return JSON.parse(raw.slice(start, end + 1));
    } catch (err) {
      lastErr = err;
      console.error(`parseExpense intento ${attempt} falló:`, err.message);
    }
  }
  throw lastErr;
}

// --- Helpers de presentación ---

export function groupName(state, id) {
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
  const origen = p.mp
    ? `${p.mp.test ? '🧪 *PRUEBA* · ' : ''}💸 *Detecté un gasto en Mercado Pago* (${mpWhen(p.mp)})\n\n`
    : '';
  return `${origen}📝 *${money}* — ${p.description}\nCategoría: *${g}${sub}*${persona}`;
}

// "25/10 14:10" en hora argentina.
function mpWhen(o) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(o.createdAt)).replace(',', '');
}

export function fmt(n) {
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

export async function commitExpense(p, inputMethod = 'telegram') {
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
    date: p.mp?.date || todayAR(),
    type: 'variable',
    inputMethod: p.mp ? 'mercadopago' : inputMethod,
    mpPaymentId: p.mp?.mpId || null,
    recurringId: null,
    createdAt: Date.now(),
  });

  await putState('main', state);
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
    if (pendingContext?.mp && parsed.isCorrection) parsed.amount ||= pendingContext.amount;
    if (!parsed.confident || !parsed.amount) {
      return send('No pude sacar el monto o no entendí bien. Probá algo como "gasté 5000 en nafta".');
    }
    const isCorrection = Boolean(pendingContext && parsed.isCorrection);
    delete parsed.isCorrection;

    if (isCorrection) {
      const updated = { ...parsed, originalText: pendingContext.originalText, messageId: pendingContext.messageId };
      // Los de Mercado Pago conservan monto, moneda y fecha reales del pago.
      if (pendingContext.mp) {
        Object.assign(updated, { mp: pendingContext.mp, amount: pendingContext.amount, currency: pendingContext.currency });
      }
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
    await resolved(id, '❌ Cancelado desde Telegram.');
    return editText(messageId, '❌ Cancelado.');
  }

  // Modo prueba (/api/mp-check?test=1): mismo flujo, pero no se guarda nada.
  if ((action === 'sv' || action === 'cs') && pending.mp?.test) {
    if (action === 'cs') {
      pending.subcategoryId = arg === 'new' || arg === 'none' ? null : arg;
      pending.newSubcategoryName = arg === 'new' ? pending.description : null;
    }
    await deletePending(id);
    if (activePendingId === id) activePendingId = null;
    await ack('Prueba OK');
    await resolved(id, '🧪 Prueba resuelta desde Telegram (no se cargó nada).');
    return editText(messageId, `${describePending(state, pending)}\n\n🧪 *Prueba OK* — así se hubiera guardado. No se cargó nada.`);
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
      await resolved(id, `✅ Guardado desde Telegram: ${money} — ${pending.description}`);
      return editText(messageId, `✅ Guardado: *${money}* — ${pending.description}\n${g}${subName ? ' › ' + subName : ''}`);
    } catch (err) {
      console.error('Error guardando gasto de Telegram:', err.message);
      await ack('No se pudo guardar');
      return editText(messageId, '⚠️ No se pudo guardar. Probá de nuevo.');
    }
  }

  if (action === 'mp') {
    await ack();
    try {
      const pend = await buildMpPending(pending.mp, state, arg === 'mel' ? 'Mel' : null);
      await savePending(id, { ...pend, messageId });
      activePendingId = id;
      return editText(messageId, describePending(state, pend), confirmKeyboard(id));
    } catch (err) {
      console.error('Error armando gasto de Mercado Pago:', err.message);
      return editText(messageId, '⚠️ No pude armar el gasto. Cargalo a mano.');
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
      await resolved(id, `✅ Guardado desde Telegram: ${money} — ${pending.description}`);
      return editText(messageId, `✅ Guardado: *${money}* — ${pending.description}\n${g}${subName ? ' › ' + subName : ''}`);
    } catch (err) {
      console.error('Error guardando gasto (subcategoría) de Telegram:', err.message);
      await ack('No se pudo guardar');
      return editText(messageId, '⚠️ No se pudo guardar. Probá de nuevo.');
    }
  }
}

// --- Egresos detectados en Mercado Pago (ver server/mercadopago.js) ---

// Le pide a Claude la categoría como si Pablo hubiera escrito el gasto; el
// monto, la moneda y la fecha salen siempre de Mercado Pago.
export async function buildMpPending(o, state, personName) {
  const text = `${o.description} ${o.amount}${personName ? ` de ${personName}` : ''}`;
  let parsed;
  try {
    parsed = await parseExpense(text, state);
  } catch (err) {
    console.error('parseExpense (MP) falló, va sin categoría:', err.message);
    parsed = { groupId: null, subcategoryId: null, newGroupName: null, newSubcategoryName: null };
  }
  return {
    ...parsed,
    amount: o.amount,
    currency: o.currency,
    personName: personName || null,
    description: parsed.description || o.description,
    confident: true,
    mp: o,
    originalText: text,
  };
}

// Avisa por Telegram y en el chat de la app (pendingHooks.created). Solo
// falla (para que se reintente) si no salió por ninguno de los dos.
export async function notifyMpOutflow(o) {
  const id = randomUUID().slice(0, 8);
  const money = o.currency === 'USD' ? `US$ ${fmt(o.amount)}` : `$ ${fmt(o.amount)}`;
  let pend, text, extra;
  if (o.toll) {
    // Mercado Pago no manda la patente: hay que preguntar de quién es el auto.
    pend = { mp: o };
    text = `${o.test ? '🧪 *PRUEBA* · ' : ''}🚗 *Peaje ${money}* (${mpWhen(o)})\n¿De quién es?`;
    extra = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Mío', callback_data: `mp:${id}:me` }, { text: 'Mel', callback_data: `mp:${id}:mel` }],
          [{ text: '❌ No lo cargo', callback_data: `cx:${id}` }],
        ],
      },
    };
  } else {
    const { data: state } = await getState();
    if (!state?.groups) throw new Error('No hay estado en la base');
    pend = await buildMpPending(o, state, null);
    text = describePending(state, pend);
    extra = confirmKeyboard(id);
  }

  let messageId = null;
  if (telegramConfigured) {
    const sent = await send(text, extra).catch((err) => ({ ok: false, description: err.message }));
    if (sent?.ok) messageId = sent.result.message_id;
    else console.error('Aviso MP por Telegram falló:', sent?.description);
  }
  await savePending(id, { ...pend, messageId });

  let inApp = false;
  try {
    inApp = Boolean(await pendingHooks.created?.(id, pend));
  } catch (err) {
    console.error('Aviso MP en la app falló:', err.message);
  }
  if (!messageId && !inApp) {
    await deletePending(id);
    throw new Error('No se pudo avisar ni por Telegram ni en la app');
  }
  // Así lo próximo que escriba Pablo ("envié a mel") se toma como aclaración de este.
  if (messageId) activePendingId = id;
}

// Cuando el pendiente se resolvió desde la app: cerrar el mensaje de Telegram
// (sin botones) para que no quede colgado.
export async function closeTelegramMessage(messageId, text) {
  if (!telegramConfigured || !messageId) return;
  await editText(messageId, text);
}

// Resumen rápido del mes (se puede pedir con /resumen o mandarlo por cron)
export async function sendResumen() {
  const { data: state } = await getState();
  if (!state || !state.groups) return send('Todavía no hay datos cargados.');
  await send(resumenText(state));
}

export function resumenText(state) {
  const mk = todayAR().slice(0, 7);
  const inMonth = (d) => (d || '').slice(0, 7) === mk;
  const gastos = state.expenses.filter((e) => inMonth(e.date));
  const ingresos = state.incomes.filter((i) => inMonth(i.date));
  const totGasto = gastos.reduce((s, e) => s + e.amount, 0);
  const totIngreso = ingresos.reduce((s, i) => s + i.amount, 0);
  const extrasId = state.config?.extrasGroupId;
  const extras = gastos.filter((e) => e.groupId === extrasId).reduce((s, e) => s + e.amount, 0);
  const budget = state.config?.extrasBudget;
  const diaADiaId = state.config?.diaADiaGroupId;
  const diaADia = gastos.filter((e) => e.groupId === diaADiaId).reduce((s, e) => s + e.amount, 0);
  const diaADiaBudget = state.config?.diaADiaBudget;
  const goal = state.config?.savingsGoal;

  let txt = `📊 *Resumen del mes*\n\nIngresos: $ ${fmt(totIngreso)}\nGastos: $ ${fmt(totGasto)}\nAhorro: $ ${fmt(totIngreso - totGasto)}`;
  if (budget) {
    const pct = Math.round((extras / budget) * 100);
    txt += `\n\nSalidas: $ ${fmt(extras)} de $ ${fmt(budget)} (${pct}%)`;
  }
  if (diaADiaBudget) {
    const pct = Math.round((diaADia / diaADiaBudget) * 100);
    txt += `\nDía a día: $ ${fmt(diaADia)} de $ ${fmt(diaADiaBudget)} (${pct}%)`;
  }
  if (goal) {
    txt += `\nMeta de ahorro: $ ${fmt(goal)} — vas $ ${fmt(totIngreso - totGasto)}`;
  }
  return txt;
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
