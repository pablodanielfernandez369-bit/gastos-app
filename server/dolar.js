// Cotización del dólar blue, cacheada en memoria 1 hora. El navegador no
// puede pegarle a sitios externos (CSP), así que la trae el servidor.
// Fuente principal: dolarhoy.com. Respaldo: dolarapi.com.

let cache = { value: null, at: 0 };
const TTL = 20 * 60 * 1000; // 20 min

// "$1.530,50" / "1530" / "$ 1530,00" -> 1530.5
function parseMoney(s) {
  if (!s) return null;
  const clean = String(s).replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

async function fromDolarHoy() {
  // La PORTADA de dolarhoy se actualiza más seguido que la subpágina del blue.
  // El tile del blue: <a class="titleText" ...>Dólar blue</a> ... <div class="val">$1525</div> ...
  const res = await fetch('https://dolarhoy.com/', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`dolarhoy ${res.status}`);
  const html = await res.text();
  // El tile del blue enlaza a /cotizaciondolarblue; los dos <div class="val">
  // que siguen son compra y venta.
  const anchor = html.indexOf('cotizaciondolarblue">');
  const slice = anchor >= 0 ? html.slice(anchor, anchor + 900) : html;
  const vals = [...slice.matchAll(/class="val">\s*\$?\s*([\d.,]+)/g)].map((x) => parseMoney(x[1]));
  const [compra, venta] = vals.filter((v) => v && v > 100);
  if (!compra || !venta) throw new Error('dolarhoy: no se pudieron leer compra/venta');
  return { compra, venta, fuente: 'dolarhoy.com' };
}

async function fromDolarApi() {
  const res = await fetch('https://dolarapi.com/v1/dolares/blue', { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`dolarapi ${res.status}`);
  const d = await res.json();
  return { compra: d.compra, venta: d.venta, fuente: 'dolarapi.com' };
}

export async function getDolarBlue() {
  if (cache.value && Date.now() - cache.at < TTL) return cache.value;

  let base = null;
  try {
    base = await fromDolarHoy();
  } catch (e1) {
    console.warn('dolarhoy falló, pruebo dolarapi:', e1.message);
    try {
      base = await fromDolarApi();
    } catch (e2) {
      console.error('No se pudo traer el dólar blue:', e2.message);
      return cache.value; // último valor conocido aunque esté viejo, o null
    }
  }

  const value = {
    compra: base.compra,
    venta: base.venta,
    // "valor del día" = punto medio entre compra y venta
    promedio: Math.round(((base.compra || 0) + (base.venta || 0)) / 2),
    fuente: base.fuente,
    fecha: new Date().toISOString(),
  };
  cache = { value, at: Date.now() };
  return value;
}
