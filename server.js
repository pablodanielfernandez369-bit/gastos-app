import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { answerQuestion as answerQuestionLocal } from './src/lib/analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5-20251001';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.post('/api/ask', async (req, res) => {
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

// Recibe el estado completo del navegador y lo reenvía como archivo .json al
// chat de Telegram configurado. Los datos viven en el localStorage del
// dispositivo, así que este backup solo se puede disparar desde el cliente
// (cuando la app está abierta).
app.post('/api/backup', async (req, res) => {
  const { state } = req.body || {};
  if (!state || !state.groups || !state.expenses || !state.incomes) {
    return res.status(400).json({ error: 'El estado no parece válido' });
  }
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(503).json({ error: 'Backup por Telegram no configurado' });
  }

  try {
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

    res.json({ ok: true });
  } catch (err) {
    console.error('Error enviando backup a Telegram:', err.message);
    res.status(502).json({ error: 'No se pudo enviar el backup a Telegram' });
  }
});

async function askClaude(question, state) {
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
  };

  const today = new Date().toISOString().slice(0, 10);

  const system =
    'Sos un asistente financiero personal argentino. Hablás en español rioplatense, ' +
    'informal y directo, como si le contestaras a un amigo por WhatsApp. ' +
    'Respondés preguntas sobre gastos e ingresos personales y del local del usuario usando ' +
    'EXCLUSIVAMENTE los datos JSON que te paso, no inventes nada que no esté ahí. ' +
    'Todos los montos están en pesos argentinos: nunca digas "dólares" ni pienses el símbolo $ como USD. ' +
    `Hoy es ${today}. "grupos" son las categorías principales, "subcategorias" cuelgan de un grupo ` +
    'por su grupoId, y "nombre" en un gasto es una etiqueta opcional (persona o proyecto) que el ' +
    'usuario le puso a mano, puede ser null. Si preguntan por una categoría y un nombre juntos ' +
    '(ej "peaje de Mel"), filtrá por ambos a la vez. Si piden comparar con el mes pasado u otro ' +
    'período, calculá vos los totales correspondientes a partir de las fechas. ' +
    'Respondé corto, 1 a 3 oraciones, con el monto final bien claro y formateado (ej: $15.000). ' +
    'No repitas la pregunta ni expliques cómo la calculaste salvo que te lo pidan.\n\n' +
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
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Anthropic API ${r.status}: ${text}`);
  }

  const data = await r.json();
  return data.content?.[0]?.text?.trim() || 'No pude generar una respuesta.';
}

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gastos app corriendo en puerto ${PORT}`);
  console.log(`Asistente con IA: ${ANTHROPIC_API_KEY ? 'activado' : 'desactivado (falta ANTHROPIC_API_KEY, usando analizador local)'}`);
});
