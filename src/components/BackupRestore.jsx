import { useRef, useState } from 'react';
import {
  downloadFile,
  exportStateAsJson,
  setLastBackupAt,
  sendTelegramBackup,
  setLastTelegramBackupAt,
} from '../lib/storage';

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
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">Backup de tus datos</h3>
      <p className="mb-3 text-sm text-gray-500">
        Todo se guarda en este dispositivo. Cada vez que abrís la app y pasó más de un día
        desde el último backup, se descarga uno a tu carpeta de Descargas y se manda otro
        al chat de Telegram.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white"
        >
          ⬇ Descargar backup
        </button>
        <button
          onClick={handleImportClick}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600"
        >
          ⬆ Restaurar backup
        </button>
      </div>

      <button
        onClick={handleTelegramBackup}
        disabled={tgStatus === 'sending'}
        className="mt-2 w-full rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-600 disabled:opacity-50"
      >
        {tgStatus === 'sending' ? 'Enviando…' : '✈ Enviar backup a Telegram ahora'}
      </button>
      {tgStatus === 'ok' && <p className="mt-1 text-sm text-ok">Backup enviado a Telegram.</p>}
      {tgStatus === 'error' && (
        <p className="mt-1 text-sm text-warn">No se pudo enviar a Telegram (¿está configurado el bot?).</p>
      )}
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
