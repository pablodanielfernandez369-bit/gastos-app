import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { answerQuestion as answerQuestionLocal } from './src/lib/analyzer.js';
import { supabaseConfigured, getState, putState, getAccessCodeRow, putAccessCodeRow } from './server/supabase.js';
import { getDolarBlue } from './server/dolar.js';
import { telegramConfigured, handleUpdate, verifyWebhook } from './server/telegram.js';
import { sendWeeklyReport } from './server/report.js';
import { todayAR, nowAR } from './server/time.js';
import { computeMonthBudget } from './src/lib/selectors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-5';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

// ---- Clave de acceso: si está configurada, todo lo que lee o escribe datos
// personales la exige por header. El celular la manda automático una vez que
// la cargaste ahí (ver src/lib/storage.js). No se le exige al webhook de
// Telegram ni al keep-alive: esos ya tienen su propia verificación
// (secret_token del bot / no exponen datos). La clave vive en Supabase (fila
// reservada '__access__' en app_state, mutable en caliente) para poder
// cambiarla desde la app sin tocar el dashboard de Render; ACCESS_CODE (env
// var) es solo la semilla inicial la primera vez que arranca sin esa fila
// creada todavía. ----

let currentAccessCode = process.env.ACCESS_CODE || null;

async function loadAccessCode() {
  if (!supabaseConfigured) return;
  try {
    const data = await getAccessCodeRow();
    if (data?.code) currentAccessCode = data.code;
  } catch (err) {
    console.error('No se pudo leer la clave de acceso guardada:', err.message);
  }
}
await loadAccessCode();

function checkAccess(req, res, next) {
  if (!currentAccessCode || req.get('x-access-code') === currentAccessCode) return next();
  res.status(401).json({ error: 'Clave incorrecta' });
}

app.get('/api/access-check', checkAccess, (req, res) => res.json({ ok: true }));

// Cambiar la clave: hay que mandar la clave ACTUAL por header (checkAccess ya
// la exige) más la nueva en el body. Sin "clave olvidada" a propósito.
app.post('/api/change-access-code', checkAccess, async (req, res) => {
  if (!supabaseConfigured) return res.status(503).json({ error: 'Base no configurada' });
  const newCode = String(req.body?.newCode || '').trim();
  if (newCode.length < 4) return res.status(400).json({ error: 'La clave nueva es muy corta' });
  try {
    await putAccessCodeRow({ code: newCode });
    currentAccessCode = newCode;
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/change-access-code:', err.message);
    res.status(502).json({ error: 'No se pudo guardar la clave nueva' });
  }
});

// ---- Estado del usuario en Supabase (fuente de verdad; el navegador tiene
// una copia en localStorage como caché offline) ----

app.get('/api/state', checkAccess, async (req, res) => {
  if (!supabaseConfigured) return res.status(503).json({ error: 'Base no configurada' });
  try {
    const { data, updatedAt } = await getState();
    res.json({ data, updatedAt });
  } catch (err) {
    console.error('GET /api/state:', err.message);
    res.status(502).json({ error: 'No se pudo leer el estado' });
  }
});

app.put('/api/state', checkAccess, async (req, res) => {
  if (!supabaseConfigured) return res.status(503).json({ error: 'Base no configurada' });
  const { state } = req.body || {};
  if (!state || !state.groups || !state.expenses || !state.incomes) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  try {
    const { updatedAt } = await putState(state);
    res.json({ ok: true, updatedAt });
  } catch (err) {
    console.error('PUT /api/state:', err.message);
    res.status(502).json({ error: 'No se pudo guardar el estado' });
  }
});

// ---- Health check (lo usa el keep-alive para que Render no se duerma) ----

app.get('/healthz', (req, res) => res.type('text').send('ok'));

// ---- Resumen semanal como imagen (lo dispara cron-job.org los domingos) ----

app.post('/api/weekly-report', async (req, res) => {
  if (req.query.key !== TELEGRAM_WEBHOOK_SECRET) return res.sendStatus(403);
  try {
    await sendWeeklyReport();
    res.json({ ok: true });
  } catch (err) {
    console.error('weekly-report:', err.message);
    res.status(502).json({ error: 'No se pudo generar el resumen' });
  }
});

// ---- Cotización del dólar blue ----

app.get('/api/dolar', async (req, res) => {
  const blue = await getDolarBlue();
  if (!blue) return res.status(502).json({ error: 'No disponible' });
  res.json(blue);
});

// ---- Webhook del bot de Telegram (cargar gastos por mensaje) ----

app.post('/api/telegram/webhook', (req, res) => {
  if (!telegramConfigured || !verifyWebhook(req)) return res.sendStatus(403);
  res.sendStatus(200); // respondemos ya; procesamos en segundo plano
  handleUpdate(req.body).catch((e) => console.error('webhook:', e.message));
});

// ---- Asistente con IA ----

app.post('/api/ask', checkAccess, async (req, res) => {
  const { question, state } = req.body || {};
  if (!question || !state) {
    return res.status(400).json({ error: 'Falta la pregunta o los datos' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.json({ answer: answerQuestionLocal(question, state), source: 'local' });
  }

  try {
    const answer = await askClaude(question, state);
    res.json({ answer, source: 'ai' });
  } catch (err) {
    console.error('Error consultando a Claude, usando analizador local de respaldo:', err.message);
    res.json({ answer: answerQuestionLocal(question, state), source: 'local-fallback' });
  }
});

// ---- Backup del estado como archivo .json al chat de Telegram ----
// state ya viene con TODO (grupos, gastos, ingresos, cambios de dólares,
// condonaciones de préstamo, config) porque se manda el objeto completo
// tal cual está guardado — no hay que listar campos, se actualiza solo.

async function sendBackupToTelegram(state) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Backup por Telegram no configurado');
  }
  const fecha = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify(state, null, 2);
  const form = new FormData();
  form.append('chat_id', TELEGRAM_CHAT_ID);
  form.append('caption', `Backup gastos ${fecha}`);
  form.append(
    'document',
    new Blob([json], { type: 'application/json' }),
    `backup_gastos_${fecha}.json`
  );

  const tg = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  const data = await tg.json();
  if (!data.ok) throw new Error(data.description || `Telegram respondió ${tg.status}`);
}

// Disparado por la app (requiere tenerla abierta) — se deja para el botón
// manual "Enviar backup a Telegram ahora" de Ajustes.
app.post('/api/backup', checkAccess, async (req, res) => {
  const { state } = req.body || {};
  if (!state || !state.groups || !state.expenses || !state.incomes) {
    return res.status(400).json({ error: 'El estado no parece válido' });
  }
  try {
    await sendBackupToTelegram(state);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando backup a Telegram:', err.message);
    res.status(502).json({ error: 'No se pudo enviar el backup a Telegram' });
  }
});

// Backup automático de verdad: lee el estado directo de Supabase (no
// depende de que la app esté abierta) y lo manda a Telegram. Lo dispara
// un cron externo (cron-job.org), protegido con el mismo secret que el
// resumen semanal — no lleva ACCESS_CODE porque ese es para sesiones de
// navegador, no para un cron.
app.post('/api/backup-cron', async (req, res) => {
  if (req.query.key !== TELEGRAM_WEBHOOK_SECRET) return res.sendStatus(403);
  if (!supabaseConfigured) return res.status(503).json({ error: 'Base no configurada' });
  try {
    const { data: state } = await getState();
    if (!state || !state.groups) return res.status(503).json({ error: 'Todavía no hay datos guardados' });
    await sendBackupToTelegram(state);
    res.json({ ok: true });
  } catch (err) {
    console.error('backup-cron:', err.message);
    res.status(502).json({ error: 'No se pudo enviar el backup automático' });
  }
});

// ---- Cotización diaria + descuento automático de USD al gastar de más ----
// Corre 1 vez por día por un cron externo. Dos cosas:
// 1) Guarda la cotización blue de HOY en dolarHistory (un valor por día —
//    sin esto no hay forma de saber, más adelante, qué dólar corresponde
//    a un día pasado).
// 2) Si el disponible del mes está negativo (gastaste más de lo que te
//    quedaba después de tu meta de ahorro), "vende" del ahorro en dólares
//    el equivalente al sobregasto, al dólar de HOY (es la única cotización
//    que se puede conocer en el momento en que esto corre). Solo suma la
//    diferencia contra lo ya descontado este mes — nunca resta si el
//    sobregasto bajó, es un ajuste de una sola dirección.
app.post('/api/auto-deduct-cron', async (req, res) => {
  if (req.query.key !== TELEGRAM_WEBHOOK_SECRET) return res.sendStatus(403);
  if (!supabaseConfigured) return res.status(503).json({ error: 'Base no configurada' });
  try {
    const { data: state } = await getState();
    if (!state || !state.groups) return res.status(503).json({ error: 'Todavía no hay datos guardados' });

    const blue = await getDolarBlue();
    const today = todayAR();
    state.dolarHistory = state.dolarHistory && typeof state.dolarHistory === 'object' ? state.dolarHistory : {};
    if (blue?.promedio) state.dolarHistory[today] = blue.promedio;

    const rate = state.dolarHistory[today] || blue?.promedio || null;
    let deduction = null;
    if (rate) {
      const b = computeMonthBudget(state, nowAR());
      const overspend = b.disponible.value < 0 ? -b.disponible.value : 0;
      const mk = today.slice(0, 7);
      state.autoDeductions = Array.isArray(state.autoDeductions) ? state.autoDeductions : [];
      const alreadyThisMonth = state.autoDeductions
        .filter((d) => (d.date || '').slice(0, 7) === mk)
        .reduce((sum, d) => sum + (d.ars || 0), 0);
      const newOverspend = overspend - alreadyThisMonth;
      if (newOverspend > 1) {
        deduction = { id: `auto_${Date.now()}`, date: today, ars: newOverspend, usd: newOverspend / rate, rate, createdAt: Date.now() };
        state.autoDeductions.push(deduction);
      }
    }

    const { updatedAt } = await putState(state);
    res.json({ ok: true, updatedAt, rate, deduction });
  } catch (err) {
    console.error('auto-deduct-cron:', err.message);
    res.status(502).json({ error: 'No se pudo procesar' });
  }
});

async function askClaude(question, state) {
  const today = todayAR();
  const mesActual = today.slice(0, 7);

  // Sumar a mano una lista de gastos es justo donde un modelo rápido se
  // equivoca (probado: le erró un total de gastos por persona). Le mandamos
  // los totales ya calculados por persona y por grupo para que los use en
  // vez de sumar los montos él mismo.
  const sumBy = (keyFn) => {
    const map = {};
    for (const e of state.expenses) {
      const k = keyFn(e);
      if (k == null) continue;
      if (!map[k]) map[k] = { totalMesActual: 0, totalHistorico: 0 };
      map[k].totalHistorico += e.amount;
      if (e.date.slice(0, 7) === mesActual) map[k].totalMesActual += e.amount;
    }
    return Object.entries(map).map(([k, v]) => ({ nombre: k, ...v }));
  };
  const groupName = (id) => state.groups.find((g) => g.id === id)?.name || null;

  // Se manda solo lo que hace falta para responder, no metadatos internos.
  const compact = {
    grupos: state.groups.map((g) => ({ id: g.id, nombre: g.name })),
    subcategorias: state.subcategories.map((s) => ({ id: s.id, grupoId: s.groupId, nombre: s.name })),
    gastos: state.expenses.map((e) => ({
      monto: e.amount,
      grupoId: e.groupId,
      subcategoriaId: e.subcategoryId,
      descripcion: e.description,
      nombre: e.personName,
      fecha: e.date,
      tipo: e.type,
    })),
    ingresos: state.incomes.map((i) => ({ monto: i.amount, descripcion: i.description, fecha: i.date })),
    totalesPreCalculados: {
      porPersona: sumBy((e) => e.personName),
      porCategoria: sumBy((e) => groupName(e.groupId)),
    },
  };

  const system =
    'Sos un asistente financiero personal argentino, en español rioplatense. ' +
    'Respondés preguntas sobre gastos e ingresos personales y del local del usuario usando ' +
    'EXCLUSIVAMENTE los datos JSON que te paso, no inventes nada que no esté ahí. ' +
    'Todos los montos están en pesos argentinos: nunca digas "dólares" ni pienses el símbolo $ como USD. ' +
    `Hoy es ${today}. "grupos" son las categorías principales, "subcategorias" cuelgan de un grupo ` +
    'por su grupoId, y "nombre" en un gasto es una etiqueta opcional (persona o proyecto) que el ' +
    'usuario le puso a mano, puede ser null. ' +
    '"totalesPreCalculados" ya trae sumado el total del mes actual y el histórico, por persona y por ' +
    'categoría — SI la pregunta es "cuánto gastó/lleva gastado X" o "cuánto se gastó en tal categoría" ' +
    '(mes actual o total histórico), USÁ ESE NÚMERO TAL CUAL, no vuelvas a sumar los gastos uno por uno ' +
    '(ahí es donde te equivocás). Solo sumá manualmente cuando te pidan algo que no está precalculado: ' +
    'un rango de fechas específico, una subcategoría, o una combinación categoría+nombre a la vez ' +
    '(ej "peaje de Mel") — en esos casos filtrá los gastos vos y sumá con cuidado, revisando el total dos veces. ' +
    'Si piden comparar con el mes pasado, calculá el total de ese mes filtrando por fecha. ' +
    'Respondé directo al dato, sin preámbulo ni charla: nada de "dale", saludos, comentarios ' +
    'de color ni relleno conversacional. Solo el monto/dato pedido, bien claro y formateado ' +
    '(ej: $15.000), en la menor cantidad de palabras posible — una frase corta alcanza, o ' +
    'directamente el número solo si la pregunta es simple. No repitas la pregunta ni expliques ' +
    'cómo lo calculaste salvo que te lo pidan.\n\n' +
    `DATOS:\n${JSON.stringify(compact)}`;

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
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Anthropic API ${r.status}: ${text}`);
  }

  const data = await r.json();
  // Sonnet 5 a veces antepone un bloque "thinking" antes del de texto: no
  // asumir que la respuesta está en content[0], buscar el primer bloque de
  // texto real.
  const textBlock = data.content?.find((b) => b.type === 'text');
  return textBlock?.text?.trim() || 'No pude generar una respuesta.';
}

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gastos app corriendo en puerto ${PORT}`);
  console.log(`  Asistente IA: ${ANTHROPIC_API_KEY ? 'ok' : 'off (falta ANTHROPIC_API_KEY)'}`);
  console.log(`  Supabase: ${supabaseConfigured ? 'ok' : 'off'}`);
  console.log(`  Bot Telegram: ${telegramConfigured ? 'ok' : 'off'}`);
});
