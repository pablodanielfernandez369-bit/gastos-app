import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useSpeechRecognition } from '../lib/speech';

// Bottom sheet con un input tipo chat + botón de micrófono, para cargar un
// ingreso hablando o tipeando en una sola frase. Al confirmar, entrega el
// texto crudo al componente padre, que lo parsea y abre el formulario de
// confirmación editable — acá nunca se guarda nada.
export default function QuickEntrySheet({ open, onClose, onSubmitText, onUseClassicForm }) {
  const [text, setText] = useState('');
  const { supported, listening, transcript, start, stop, error } = useSpeechRecognition();

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  useEffect(() => {
    if (listening) setText(transcript);
  }, [transcript, listening]);

  // Cuando el reconocimiento termina solo (silencio), confirmamos automático
  // si se llegó a transcribir algo.
  useEffect(() => {
    if (!listening && transcript.trim()) {
      onSubmitText(transcript.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  function handleTextSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmitText(text.trim());
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo ingreso">
      <form onSubmit={handleTextSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            className="flex-1 rounded-lg border border-gray-300 px-3 py-3 text-base"
            placeholder="ej: cobré 300 mil de sueldo"
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
              aria-label={listening ? 'Detener grabación' : 'Grabar por voz'}
            >
              🎙️
            </button>
          )}
        </div>

        {listening && (
          <p className="text-center text-sm text-gray-500">Escuchando… decilo con tus palabras</p>
        )}
        {!supported && (
          <p className="text-sm text-gray-500">
            Tu navegador no soporta dictado por voz, pero podés escribirlo igual.
          </p>
        )}
        {error && (
          <p className="text-sm text-warn">No se pudo escuchar el micrófono ({error}).</p>
        )}

        <button
          type="submit"
          disabled={!text.trim()}
          className="w-full rounded-lg bg-gray-900 py-3 font-medium text-white disabled:opacity-40"
        >
          Analizar
        </button>

        <button
          type="button"
          onClick={onUseClassicForm}
          className="w-full text-center text-sm text-gray-500 underline"
        >
          Prefiero cargarlo con el formulario clásico
        </button>
      </form>
    </Modal>
  );
}
