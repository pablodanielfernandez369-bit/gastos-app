// El servidor corre en UTC (Render), pero Pablo vive en Argentina. Todo lo
// que sea "hoy" / "esta semana" del lado server tiene que ser hora de Buenos
// Aires, si no un gasto cargado 22:00 ART queda con la fecha de mañana.

const TZ = 'America/Argentina/Buenos_Aires';

// "2026-09-09" según el reloj de Buenos Aires.
export function todayAR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

// Un objeto Date cuyos getters locales (getDate, getDay, getMonth...) reflejan
// la hora de Buenos Aires. Sirve para hacer cálculos de calendario; para
// formatear a YYYY-MM-DD usar isoAR() abajo, no toISOString().
export function nowAR() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
}

// YYYY-MM-DD a partir de los componentes locales del Date (no UTC).
export function isoAR(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
