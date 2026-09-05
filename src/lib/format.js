export function formatARS(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatMonthLabel(iso) {
  const [y, m] = iso.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
}

export function monthKey(iso) {
  return iso.slice(0, 7); // YYYY-MM
}

// Devuelve [desde, hasta] en formato ISO (inclusive) para un período dado.
export function rangeForPeriod(period, customFrom, customTo) {
  const now = new Date();
  const toISO = (d) => {
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  };

  if (period === 'dia') {
    const iso = toISO(now);
    return [iso, iso];
  }
  if (period === 'semana') {
    const day = now.getDay() || 7; // lunes=1 ... domingo=7
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [toISO(monday), toISO(sunday)];
  }
  if (period === 'mes') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [toISO(first), toISO(last)];
  }
  if (period === 'personalizado') {
    return [customFrom, customTo];
  }
  return [toISO(new Date(2000, 0, 1)), toISO(now)];
}

export function isInRange(dateISO, from, to) {
  if (!from || !to) return true;
  return dateISO >= from && dateISO <= to;
}
