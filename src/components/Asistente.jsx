import { useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../lib/speech';
import { answerQuestion } from '../lib/analyzer';

const EJEMPLOS = [
  '¿Cómo voy con Insumos comparado al mes pasado?',
  '¿Cuánto gasté este mes?',
  '¿Cómo viene mi ahorro respecto al mes pasado?',
  '¿Subió o bajó la luz?',
];

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'es-AR';
  window.speechSynthesis.speak(utterance);
}

export default function Asistente({ state }) {
  const [text, setText] = useState('');
  const [history, setHistory] = useState([]); // { question, answer }
  const { supported, listening, transcript, start, stop, error } = useSpeechRecognition();
  const listRef = useRef(null);

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

  function ask(question) {
    const answer = answerQuestion(question, state);
    setHistory((h) => [...h, { question, answer }]);
    setText('');
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
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <p className="mb-2 text-sm font-medium text-gray-700">
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
            <div className="ml-8 rounded-xl rounded-br-sm bg-gray-900 px-3 py-2 text-sm text-white">
              {h.question}
            </div>
            <div className="mr-8 rounded-xl rounded-bl-sm bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
              {h.answer}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2">
        <input
          className="flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base"
          placeholder="Escribí tu pregunta…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {supported && (
          <button
            type="button"
            onClick={listening ? stop : start}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl text-white ${
              listening ? 'bg-warn animate-pulse' : 'bg-gray-900'
            }`}
            aria-label={listening ? 'Detener grabación' : 'Preguntar por voz'}
          >
            🎙️
          </button>
        )}
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-40"
          aria-label="Enviar pregunta"
        >
          ➤
        </button>
      </form>
      {!supported && (
        <p className="pt-1 text-center text-xs text-gray-400">
          Tu navegador no soporta dictado por voz, pero podés escribir la pregunta.
        </p>
      )}
      {error && <p className="pt-1 text-center text-xs text-warn">No se pudo escuchar el micrófono ({error}).</p>}
    </div>
  );
}
