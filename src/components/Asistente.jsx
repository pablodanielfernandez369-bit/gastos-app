import { useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../lib/speech';

async function fetchAnswer(question, state) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, state }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.answer || 'No pude generar una respuesta.';
}

const EJEMPLOS = [
  '¿Cómo voy con Insumos comparado al mes pasado?',
  '¿Cuánto gasté este mes?',
  '¿Cómo viene mi ahorro respecto al mes pasado?',
  '¿Subió o bajó la luz?',
];

// El sintetizador no sabe que "$" acá es pesos argentinos (algunas voces
// lo leen como dólares en inglés) — se lo decimos explícito antes de hablar,
// y le sacamos los emojis que algunas voces intentan "leer".
function toSpoken(text) {
  return text
    .replace(/\$\s?(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?)/g, (_, num) => `${num} pesos`)
    .replace(/[⚠️✅👍👎▲▼]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pickSpanishVoice() {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /^es-(AR|419)/i.test(v.lang)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith('es')) ||
    null
  );
}

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(toSpoken(text));
  utterance.lang = 'es-AR';
  const voice = pickSpanishVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export default function Asistente({ state }) {
  const [text, setText] = useState('');
  const [history, setHistory] = useState([]); // { question, answer }
  const { supported, listening, transcript, start, stop, error } = useSpeechRecognition();
  const listRef = useRef(null);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }, []);

  useEffect(() => {
    if (listening) setText(transcript);
  }, [transcript, listening]);

  useEffect(() => {
    if (!listening && transcript.trim()) {
      ask(transcript.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  async function ask(question) {
    setText('');
    setHistory((h) => [...h, { question, answer: null }]);

    let answer;
    try {
      answer = await fetchAnswer(question, state);
    } catch (err) {
      answer = 'No pude conectarme para responder. Revisá tu conexión y probá de nuevo.';
    }

    setHistory((h) => h.map((item, i) => (i === h.length - 1 ? { ...item, answer } : item)));
    speak(answer);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    ask(text.trim());
  }

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[360px] flex-col">
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto pb-2">
        {history.length === 0 && (
          <div className="rounded-2xl border border-hair bg-surface p-4">
            <p className="mb-2 text-sm font-medium text-ink">
              Preguntame por voz o texto, por ejemplo:
            </p>
            <ul className="space-y-1.5">
              {EJEMPLOS.map((ej) => (
                <li key={ej}>
                  <button
                    onClick={() => ask(ej.replace(/[¿?]/g, ''))}
                    className="text-left text-sm text-blue-600 underline"
                  >
                    {ej}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {history.map((h, i) => (
          <div key={i} className="space-y-1.5">
            <div className="ml-8 rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm text-paper">
              {h.question}
            </div>
            <div className="mr-8 rounded-2xl rounded-bl-md border border-hair bg-surface px-3 py-2 text-sm text-ink">
              {h.answer === null ? (
                <span className="inline-flex gap-1 text-ink-faint">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce [animation-delay:0.15s]">·</span>
                  <span className="animate-bounce [animation-delay:0.3s]">·</span>
                </span>
              ) : (
                h.answer
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
        <input
          className="flex-1 rounded-lg border border-hair px-3 py-3 text-base"
          placeholder="Escribí tu pregunta…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {supported && (
          <button
            type="button"
            onClick={listening ? stop : start}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-paper ${
              listening ? 'bg-warn animate-pulse' : 'bg-accent'
            }`}
            aria-label={listening ? 'Detener grabación' : 'Preguntar por voz'}
          >
            🎙️
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-paper disabled:opacity-40"
          aria-label="Enviar pregunta"
        >
          ➤
        </button>
      </form>
      {!supported && (
        <p className="pt-1 text-center text-xs text-ink-faint">
          Tu navegador no soporta dictado por voz, pero podés escribir la pregunta.
        </p>
      )}
      {error && <p className="pt-1 text-center text-xs text-warn">No se pudo escuchar el micrófono ({error}).</p>}
    </div>
  );
}
