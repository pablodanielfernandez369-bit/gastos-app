import { useEffect, useState } from 'react';

// Trae la cotización del dólar blue del servidor (el navegador no puede pegarle
// a la API directo). Cachea el último valor en localStorage para mostrar algo
// aunque esté offline.
const KEY = 'gastos_app_v1_dolar';

function cached() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function useDolar() {
  const [dolar, setDolar] = useState(cached);

  useEffect(() => {
    let done = false;
    fetch('/api/dolar')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (done || !d || !d.venta) return;
        setDolar(d);
        try {
          localStorage.setItem(KEY, JSON.stringify(d));
        } catch {
          /* sin espacio: no pasa nada */
        }
      })
      .catch(() => {});
    return () => {
      done = true;
    };
  }, []);

  return dolar; // { compra, venta, promedio, fecha } | null
}

// Cotización a usar para convertir a USD: la que el usuario fijó a mano, si no
// la venta del blue, si no la última que se usó al cargar un gasto en USD.
export function usdRate(config, dolar) {
  return config?.fxRateManual || dolar?.venta || config?.fxRate || null;
}
