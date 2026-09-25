import { useRef, useState } from 'react';
import {
  downloadFile,
  exportStateAsJson,
  setLastBackupAt,
  sendTelegramBackup,
  setLastTelegramBackupAt,
} from '../lib/storage';

// Hay dos hojas ocultas listas para imprimir (billeteras y comparativa,
// ver PrintWallets.jsx/PrintComparison.jsx e index.css). Marcamos el body
// con qué botón se apretó justo antes de imprimir, así el CSS de
// impresión sabe cuál de las dos mostrar y cuál ocultar; se saca la marca
// al cerrar el diálogo de impresión.
function printSection(mode) {
  const cls = `print-mode-${mode}`;
  document.body.classList.add(cls);
  const cleanup = () => {
    document.body.classList.remove(cls);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

export default function BackupRestore({ state, actions }) {
  const fileInputRef = useRef(null);
  const [tgStatus, setTgStatus] = useState('idle'); // idle | sending | ok | error

  async function handleTelegramBackup() {
    setTgStatus('sending');
    try {
      await sendTelegramBackup(state);
      setLastTelegramBackupAt(Date.now());
      setTgStatus('ok');
    } catch {
      setTgStatus('error');
    }
  }

  function handleExport() {
    const json = exportStateAsJson(state);
    downloadFile(`backup_gastos_${new Date().toISOString().slice(0, 10)}.json`, json, 'application/json');
    setLastBackupAt(Date.now());
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.groups || !parsed.expenses || !parsed.incomes) {
          alert('El archivo no parece un backup válido.');
          return;
        }
        if (!confirm('Esto reemplaza TODOS tus datos actuales por los del backup. ¿Continuar?')) return;
        actions.replaceState(parsed);
        setLastBackupAt(Date.now());
        alert('Backup restaurado.');
      } catch (err) {
        alert('No se pudo leer el archivo. ¿Es un backup exportado desde acá?');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="rounded-2xl border border-hair bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">Backup de tus datos</h3>
      <p className="mb-3 text-sm text-ink-soft">
        Todo se guarda en este dispositivo. Cada vez que abrís la app y pasó más de un día
        desde el último backup, se descarga uno a tu carpeta de Descargas y se manda otro
        al chat de Telegram.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 rounded-lg bg-accent py-2.5 text-sm font-medium text-paper"
        >
          ⬇ Descargar backup
        </button>
        <button
          onClick={handleImportClick}
          className="flex-1 rounded-lg border border-hair py-2.5 text-sm font-medium text-ink-soft"
        >
          ⬆ Restaurar backup
        </button>
      </div>

      <button
        onClick={handleTelegramBackup}
        disabled={tgStatus === 'sending'}
        className="mt-2 w-full rounded-lg border border-hair py-2.5 text-sm font-medium text-ink-soft disabled:opacity-50"
      >
        {tgStatus === 'sending' ? 'Enviando…' : '✈ Enviar backup a Telegram ahora'}
      </button>
      {tgStatus === 'ok' && <p className="mt-1 text-sm text-ok">Backup enviado a Telegram.</p>}
      {tgStatus === 'error' && (
        <p className="mt-1 text-sm text-warn">No se pudo enviar a Telegram (¿está configurado el bot?).</p>
      )}

      <button
        onClick={() => printSection('wallets')}
        className="mt-2 w-full rounded-lg border border-hair py-2.5 text-sm font-medium text-ink-soft"
      >
        🖨 Imprimir billeteras
      </button>
      <button
        onClick={() => printSection('comparison')}
        className="mt-2 w-full rounded-lg border border-hair py-2.5 text-sm font-medium text-ink-soft"
      >
        🖨 Imprimir tabla comparativa
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
