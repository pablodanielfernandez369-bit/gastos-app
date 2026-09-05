// Parser de lenguaje natural en español rioplatense para el monto y la
// descripción de un ingreso dictado o tipeado (los gastos se cargan siempre
// con el formulario manual).

const CURRENCY_WORDS = ['usd', 'u$s', 'dolares', 'dolar', 'verdes'];

function stripAccents(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(text) {
  return stripAccents(text).toLowerCase().trim();
}

// Devuelve { amount, currency, matchedText } o { amount: null } si no
// encuentra ningún número interpretable.
export function extractAmount(rawText) {
  const text = normalize(rawText);

  const hasUsd = CURRENCY_WORDS.some((w) => text.includes(w));
  const currency = hasUsd ? 'USD' : 'ARS';

  // 1) "15 mil", "250 mil", "3 lucas", "1 millon", "2 millones"
  const multiplierMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(mil|lucas?|millones|millon)\b/);
  if (multiplierMatch) {
    const base = parseFloat(multiplierMatch[1].replace(',', '.'));
    const word = multiplierMatch[2];
    const factor = word.startsWith('mil') || word.startsWith('luca') ? 1000 : 1000000;
    return { amount: base * factor, currency, matchedText: multiplierMatch[0] };
  }

  // 2) Números "a la argentina": 1.550.000 / 1.550.000,50 / 8500 / 250
  const plainMatch = text.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/);
  if (plainMatch) {
    const cleaned = plainMatch[0].replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(cleaned);
    if (Number.isFinite(amount)) {
      return { amount, currency, matchedText: plainMatch[0] };
    }
  }

  return { amount: null, currency, matchedText: null };
}

// Limpia la frase para usarla como descripción: saca el monto detectado y
// muletillas típicas de inicio ("cobré", "recibí", etc).
export function cleanDescription(rawText, matchedAmountText) {
  let text = rawText.trim();
  if (matchedAmountText) {
    const re = new RegExp(matchedAmountText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    text = text.replace(re, '');
  }
  text = text
    .replace(/\b(pesos|ars|usd|u\$s|dolares|d[oó]lar(es)?)\b/gi, '')
    .replace(/^\s*(gast[eé]|pagu[eé]|compr[eé]|compra de|compra en|cobr[eé]|recib[ií])\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!text) text = rawText.trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Parser para ingresos: no hay categoría, solo monto + descripción.
export function parseIncomeText(rawText) {
  const { amount, currency, matchedText } = extractAmount(rawText);
  const description = cleanDescription(rawText, matchedText);
  return {
    amountRaw: amount,
    currency,
    description: description || rawText.trim(),
    rawText,
    needsReview: amount === null,
  };
}
