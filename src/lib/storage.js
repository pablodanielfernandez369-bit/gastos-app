// Capa de persistencia. Hoy usa localStorage; el resto de la app solo
// conoce getState()/setState(), así que el día de mañana esto se puede
// reemplazar por IndexedDB o un backend real sin tocar nada más.

const STORAGE_KEY = 'gastos_app_v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('No se pudo leer el almacenamiento local', e);
    return null;
  }
}

export function persistState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('No se pudo guardar en el almacenamiento local', e);
  }
}

export function exportStateAsJson(state) {
  return JSON.stringify(state, null, 2);
}

const LAST_BACKUP_KEY = 'gastos_app_v1_last_backup';

export function getLastBackupAt() {
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  return raw ? Number(raw) : null;
}

export function setLastBackupAt(timestamp) {
  localStorage.setItem(LAST_BACKUP_KEY, String(timestamp));
}

const LAST_TG_BACKUP_KEY = 'gastos_app_v1_last_tg_backup';

export function getLastTelegramBackupAt() {
  const raw = localStorage.getItem(LAST_TG_BACKUP_KEY);
  return raw ? Number(raw) : null;
}

export function setLastTelegramBackupAt(timestamp) {
  localStorage.setItem(LAST_TG_BACKUP_KEY, String(timestamp));
}

// Manda el estado al backend, que lo reenvía como archivo .json al chat de
// Telegram. Lanza si el backend no lo pudo enviar (o no está configurado).
export async function sendTelegramBackup(state) {
  const res = await fetch('/api/backup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `El backup falló (${res.status})`);
  }
  return true;
}

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
