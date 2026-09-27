// Capa de persistencia. Hoy usa localStorage; el resto de la app solo
// conoce getState()/setState(), así que el día de mañana esto se puede
// reemplazar por IndexedDB o un backend real sin tocar nada más.
//
// Multi-billetera: 'main' (la histórica, de siempre) sigue usando la MISMA
// clave sin sufijo que ya existía — cero riesgo de perder el caché de nadie
// al agregar esto. Una billetera nueva usa una clave con sufijo por id.
const STORAGE_KEY = 'gastos_app_v1';

function keyFor(walletId) {
  return walletId && walletId !== 'main' ? `${STORAGE_KEY}_${walletId}` : STORAGE_KEY;
}

export function loadState(walletId = 'main') {
  try {
    const raw = localStorage.getItem(keyFor(walletId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('No se pudo leer el almacenamiento local', e);
    return null;
  }
}

export function persistState(state, walletId = 'main') {
  try {
    localStorage.setItem(keyFor(walletId), JSON.stringify(state));
  } catch (e) {
    console.error('No se pudo guardar en el almacenamiento local', e);
  }
}

export function exportStateAsJson(state) {
  return JSON.stringify(state, null, 2);
}

// --- Clave de acceso: el celular que la puso una vez queda andando solo
// (se manda en cada pedido al servidor), cualquier otro que abra el link
// sin la clave correcta no puede leer ni escribir el estado. ---

const ACCESS_CODE_KEY = 'gastos_app_v1_access_code';

export function getAccessCode() {
  return localStorage.getItem(ACCESS_CODE_KEY) || '';
}

export function setAccessCode(code) {
  localStorage.setItem(ACCESS_CODE_KEY, code);
}

export function clearAccessCode() {
  localStorage.removeItem(ACCESS_CODE_KEY);
}

export function accessHeaders() {
  const code = getAccessCode();
  return code ? { 'x-access-code': code } : {};
}

// Cambia la clave de acceso. Hace falta mandar la clave actual (va sola en
// el header, como cualquier otro pedido) más la nueva. Si el server la
// acepta, este dispositivo se queda logueado con la nueva sin pedir nada de
// nuevo — cualquier OTRO dispositivo con la vieja guardada va a quedar
// afuera la próxima vez que la app se fije si sigue valiendo (AccessGate).
export async function changeAccessCode(newCode) {
  const res = await fetch('/api/change-access-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({ newCode }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `POST /api/change-access-code ${res.status}`);
  setAccessCode(newCode);
  return true;
}

// --- Sincronización con el servidor (Supabase es la fuente de verdad;
// localStorage queda como caché para andar rápido y offline) ---

export async function fetchServerState(walletId = 'main') {
  const res = await fetch(`/api/state?wallet=${encodeURIComponent(walletId)}`, { headers: accessHeaders() });
  if (!res.ok) throw new Error(`GET /api/state ${res.status}`);
  return res.json(); // { data, updatedAt }
}

export async function pushServerState(state, walletId = 'main') {
  const res = await fetch(`/api/state?wallet=${encodeURIComponent(walletId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({ state }),
  });
  if (!res.ok) throw new Error(`PUT /api/state ${res.status}`);
  return res.json(); // { ok, updatedAt }
}

// --- Billeteras: cuál está activa en ESTE dispositivo (cada uno puede tener
// una distinta abierta), y CRUD contra el server (la lista en sí es
// compartida entre dispositivos, ver server.js /api/wallets). ---

const ACTIVE_WALLET_KEY = 'gastos_app_v1_active_wallet';

export function getActiveWalletId() {
  return localStorage.getItem(ACTIVE_WALLET_KEY) || 'main';
}

export function setActiveWalletId(id) {
  localStorage.setItem(ACTIVE_WALLET_KEY, id);
}

export async function fetchWallets() {
  const res = await fetch('/api/wallets', { headers: accessHeaders() });
  if (!res.ok) throw new Error(`GET /api/wallets ${res.status}`);
  const { wallets } = await res.json();
  return wallets;
}

export async function createWallet(name) {
  const res = await fetch('/api/wallets', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...accessHeaders() },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `POST /api/wallets ${res.status}`);
  return data.wallet;
}

export async function deleteWallet(id) {
  const res = await fetch(`/api/wallets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: accessHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `DELETE /api/wallets ${res.status}`);
  return data.wallets;
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
    headers: { 'content-type': 'application/json', ...accessHeaders() },
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
