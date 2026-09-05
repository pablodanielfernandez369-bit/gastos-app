// Parser de lenguaje natural en español rioplatense.
// Recibe una frase (dictada o tipeada) y trata de extraer monto, moneda,
// categoría/subcategoría probable, tipo de gasto y una descripción limpia.
// Nunca es 100% confiable a propósito: lo que no logra inferir queda en
// null para que la confirmación se lo pida al usuario con un tap.

const FIXED_KEYWORDS = [
  'alquiler', 'expensas', 'luz', 'gas', 'internet', 'agua', 'cable', 'wifi',
  'sueldo', 'cuota', 'tarjeta',
];

const GROUP_KEYWORDS = {
  vivienda: [
    'casa', 'vivienda', 'alquiler', 'expensas', 'luz', 'gas', 'internet',
    'agua', 'cable', 'wifi', 'depto', 'departamento', 'edificio',
  ],
  local: [
    'local', 'negocio', 'empleado', 'empleada', 'sueldo', 'insumo',
    'insumos', 'publicidad', 'propaganda', 'tarjeta', 'cuota',
    'equipamiento', 'proveedor', 'mercaderia', 'ventas', 'caja',
    'panaderia', 'kiosco', 'tienda',
  ],
};

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

// Intenta matchear el nombre de alguna subcategoría existente dentro del
// texto (sin importar mayúsculas/acentos). Si no encuentra ninguna, cae a
// una detección más floja por grupo usando palabras clave genéricas.
export function guessCategory(rawText, subcategories) {
  const text = normalize(rawText);

  const sorted = [...subcategories].sort((a, b) => b.name.length - a.name.length);
  for (const sub of sorted) {
    const name = normalize(sub.name);
    if (name && name !== 'otro' && text.includes(name)) {
      return { groupId: sub.groupId, subcategoryId: sub.id };
    }
  }

  for (const [groupId, words] of Object.entries(GROUP_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) {
      return { groupId, subcategoryId: null };
    }
  }

  return { groupId: null, subcategoryId: null };
}

export function guessType(rawText, subcategoryName) {
  const text = normalize(rawText + ' ' + (subcategoryName || ''));
  if (FIXED_KEYWORDS.some((w) => text.includes(w))) return 'fijo';
  if (text.includes('compra') || text.includes('compre')) return 'puntual';
  return 'variable';
}

// Limpia la frase para usarla como descripción: saca el monto detectado y
// muletillas típicas de inicio ("gaste", "pague", etc).
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

// Parser completo para un gasto: devuelve un "draft" listo para mostrar en
// la confirmación editable (nunca se guarda directo).
export function parseExpenseText(rawText, subcategories) {
  const { amount, currency, matchedText } = extractAmount(rawText);
  const { groupId, subcategoryId } = guessCategory(rawText, subcategories);
  const subcategory = subcategories.find((s) => s.id === subcategoryId);
  const type = guessType(rawText, subcategory?.name);
  const description = cleanDescription(rawText, matchedText);

  return {
    amountRaw: amount,
    currency,
    groupId,
    subcategoryId,
    type,
    description,
    rawText,
    needsReview: amount === null || groupId === null,
  };
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
