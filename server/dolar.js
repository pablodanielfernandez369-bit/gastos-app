// Cotización del dólar blue, cacheada en memoria 1 hora. El navegador no
// puede pegarle a APIs externas (CSP), así que la trae el servidor.

let cache = { value: null, at: 0 };
const ONE_HOUR = 60 * 60 * 1000;

export async function getDolarBlue() {
  if (cache.value && Date.now() - cache.at < ONE_HOUR) return cache.value;

  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/blue', {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`dolarapi ${res.status}`);
    const d = await res.json();
    const value = {
      compra: d.compra,
      venta: d.venta,
      promedio: Math.round(((d.compra || 0) + (d.venta || 0)) / 2),
      fecha: d.fechaActualizacion || new Date().toISOString(),
    };
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error('No se pudo traer el dólar blue:', err.message);
    // devuelve el último valor conocido aunque esté viejo, o null
    return cache.value;
  }
}
