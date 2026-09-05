// Analizador local de preguntas sobre los gastos/ingresos, sin IA externa:
// reconoce de qué categoría/subcategoría o total habla la pregunta, si pide
// una comparación mes a mes o el total de un período, y arma la respuesta
// directamente a partir de los datos guardados en el dispositivo.

import { formatARS, isInRange } from './format';

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(offsetMonths) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const first = new Date(target.getFullYear(), target.getMonth(), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const toISO = (d) => {
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  };
  return [toISO(first), toISO(last)];
}

function weekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d) => {
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  };
  return [toISO(monday), toISO(sunday)];
}

function todayRange() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  const iso = new Date(now - tz).toISOString().slice(0, 10);
  return [iso, iso];
}

// Prefijos con \b al inicio (no al final): matchean "comparado", "subió",
// "bajaron", etc. sin caer en falsos positivos tipo "bajo" dentro de
// "trabajo" (ahí no hay límite de palabra antes de "baj").
const COMPARISON_PATTERNS = [
  /\bcompar/, /\bvs\b/, /\brespecto/, /\bsubi/, /\bbaj/, /\bcomo voy\b/,
  /\bcambio\b/, /\bdiferencia/, /\baument/, /\bvariacion/,
];

function isComparisonQuestion(text) {
  return COMPARISON_PATTERNS.some((re) => re.test(text));
}

function detectPeriod(text) {
  if (text.includes('mes pasado')) return { key: 'mes_pasado', label: 'el mes pasado' };
  if (text.includes('hoy')) return { key: 'dia', label: 'hoy' };
  if (text.includes('esta semana')) return { key: 'semana', label: 'esta semana' };
  return { key: 'mes', label: 'este mes' };
}

function periodToRange(periodKey) {
  if (periodKey === 'dia') return todayRange();
  if (periodKey === 'semana') return weekRange();
  if (periodKey === 'mes_pasado') return monthRange(-1);
  return monthRange(0);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matchea por palabra completa (con límites \b), no por substring suelto:
// evita que "gas" matchee dentro de "gasté", "luz" dentro de otra palabra, etc.
function containsWord(text, phrase) {
  if (!phrase) return false;
  return new RegExp(`\\b${escapeRegex(phrase)}\\b`).test(text);
}

// Palabras de la pregunta que no sirven para buscar en las descripciones
// (conectores, verbos de la propia pregunta, períodos, etc).
const STOPWORDS = new Set([
  'cuanto', 'cuanta', 'cuantos', 'cuantas', 'gaste', 'gasto', 'gastos', 'gastado',
  'gastados', 'gastada', 'llevo', 'llevas', 'llevado', 'llevados', 'en', 'el', 'la',
  'los', 'las', 'de', 'del', 'al', 'a', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
  'pasado', 'pasada', 'mes', 'semana', 'hoy', 'ano', 'anio', 'como', 'voy', 'va', 'vengo',
  'con', 'y', 'o', 'tengo', 'mi', 'mis', 'tu', 'tus', 'total', 'totales', 'subio', 'baje',
  'bajo', 'respecto', 'comparado', 'comparada', 'comparacion', 'cambio', 'diferencia',
  'aumento', 'variacion', 'es', 'son', 'fue', 'un', 'una', 'unos', 'unas', 'que', 'se',
  'me', 'le', 'por', 'para', 'ahorro', 'ahorre', 'ingreso', 'ingresos', 'cobre', 'gane',
  'compra', 'compras', 'pago', 'pagos', 'vario', 'varios', 'varias', 'efectivo',
]);

function extractWords(text) {
  return text
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// En vez de adivinar qué palabra de LA PREGUNTA importa (imposible cubrir
// todas las formas de preguntar), aprende de TUS DESCRIPCIONES qué palabras
// usás como etiqueta recurrente (ej: "Mel" al final de varios gastos) y
// después solo revisa si la pregunta menciona alguna de esas palabras, en
// cualquier lugar y con cualquier verbo.
function findDescriptionMatch(text, state) {
  const freq = new Map();
  for (const e of state.expenses) {
    const words = new Set(extractWords(normalize(e.description || '')));
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  }

  const candidates = [...freq.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].length - a[0].length
  );
  for (const [word] of candidates) {
    if (containsWord(text, word)) {
      return { type: 'description', keyword: word, name: capitalize(word) };
    }
  }
  return null;
}

// Campo "Nombre" dedicado del formulario de gastos (más confiable que
// buscar en la descripción libre, porque es explícito).
function findPersonMatch(text, state) {
  const names = new Set();
  for (const e of state.expenses) {
    if (e.personName) names.add(normalize(e.personName));
  }
  const sorted = [...names].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    if (name && containsWord(text, name)) {
      return { type: 'person', keyword: name, name: capitalize(name) };
    }
  }
  return null;
}

function findTarget(text, state) {
  const subs = [...state.subcategories].sort((a, b) => b.name.length - a.name.length);
  for (const s of subs) {
    const name = normalize(s.name);
    if (name && name !== 'otro' && containsWord(text, name)) {
      return { type: 'subcategory', id: s.id, name: s.name, groupId: s.groupId };
    }
  }
  for (const g of state.groups) {
    const name = normalize(g.name);
    if (containsWord(text, name)) {
      return { type: 'group', id: g.id, name: g.name };
    }
  }
  if (containsWord(text, 'negocio') || containsWord(text, 'local')) {
    const local = state.groups.find((g) => g.id === 'local');
    if (local) return { type: 'group', id: local.id, name: local.name };
  }

  const personMatch = findPersonMatch(text, state);
  if (personMatch) return personMatch;

  const descMatch = findDescriptionMatch(text, state);
  if (descMatch) return descMatch;

  if (/\bahorr/.test(text)) return { type: 'savings', name: 'tu ahorro' };
  if (/\bingres|\bgan[eé]\b|\bcobr/.test(text)) return { type: 'income', name: 'tus ingresos' };
  return { type: 'expense', name: 'tus gastos' };
}

function sumExpenses(state, from, to, target) {
  return state.expenses
    .filter((e) => isInRange(e.date, from, to))
    .filter((e) => {
      if (target.type === 'subcategory') return e.subcategoryId === target.id;
      if (target.type === 'group') return e.groupId === target.id;
      if (target.type === 'person') {
        return containsWord(normalize(e.personName || ''), target.keyword);
      }
      if (target.type === 'description') {
        return containsWord(normalize(e.description || ''), target.keyword);
      }
      return true; // 'expense' genérico: todos
    })
    .reduce((sum, e) => sum + e.amount, 0);
}

function sumIncomes(state, from, to) {
  return state.incomes
    .filter((i) => isInRange(i.date, from, to))
    .reduce((sum, i) => sum + i.amount, 0);
}

function answerComparison(target, state) {
  const [prevFrom, prevTo] = monthRange(-1);
  const [currFrom, currTo] = monthRange(0);

  if (target.type === 'income') {
    const prev = sumIncomes(state, prevFrom, prevTo);
    const curr = sumIncomes(state, currFrom, currTo);
    return comparisonSentence('Tus ingresos', prev, curr);
  }
  if (target.type === 'savings') {
    const prev = sumIncomes(state, prevFrom, prevTo) - sumExpenses(state, prevFrom, prevTo, { type: 'expense' });
    const curr = sumIncomes(state, currFrom, currTo) - sumExpenses(state, currFrom, currTo, { type: 'expense' });
    return comparisonSentence('Tu ahorro', prev, curr, true);
  }

  const prev = sumExpenses(state, prevFrom, prevTo, target);
  const curr = sumExpenses(state, currFrom, currTo, target);

  if (prev === 0 && curr === 0) {
    return `No tengo gastos de ${target.name} ni este mes ni el mes pasado.`;
  }
  if (prev === 0) {
    return `El mes pasado no tenías gastos de ${target.name}, y este mes van ${formatARS(curr)}.`;
  }
  return comparisonSentence(capitalize(target.name), prev, curr);
}

function comparisonSentence(subject, prev, curr, isSavings = false) {
  if (prev === 0 && curr === 0) return `${subject}: no tengo datos del mes pasado para comparar.`;
  const deltaPct = ((curr - prev) / prev) * 100;
  const went = deltaPct === 0 ? 'se mantuvo igual' : deltaPct > 0 ? 'subió' : 'bajó';
  const badGood = isSavings
    ? (deltaPct > 0 ? '👍' : deltaPct < 0 ? '👎' : '')
    : (deltaPct > 0 ? '⚠️' : deltaPct < 0 ? '✅' : '');
  const pctTxt = deltaPct === 0 ? '' : ` un ${Math.abs(deltaPct).toFixed(0)}%`;
  return `${subject} ${went}${pctTxt} respecto al mes pasado: de ${formatARS(prev)} a ${formatARS(curr)}. ${badGood}`.trim();
}

function answerTotal(target, text, state) {
  const period = detectPeriod(text);
  const [from, to] = periodToRange(period.key);

  if (target.type === 'income') {
    const total = sumIncomes(state, from, to);
    return `${capitalizePeriod(period.label)} cobraste ${formatARS(total)}.`;
  }
  if (target.type === 'savings') {
    const income = sumIncomes(state, from, to);
    const expense = sumExpenses(state, from, to, { type: 'expense' });
    const savings = income - expense;
    return `${capitalizePeriod(period.label)} tu ahorro es de ${formatARS(savings)} (ingresos ${formatARS(income)}, gastos ${formatARS(expense)}).`;
  }

  const total = sumExpenses(state, from, to, target);
  if (target.type === 'expense') {
    return `${capitalizePeriod(period.label)} gastaste un total de ${formatARS(total)}.`;
  }
  return `${capitalizePeriod(period.label)} gastaste ${formatARS(total)} en ${target.name}.`;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function capitalizePeriod(label) {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Punto de entrada: recibe la pregunta en texto crudo y devuelve la
// respuesta en texto (se puede además leer en voz alta con speechSynthesis).
export function answerQuestion(rawText, state) {
  const text = normalize(rawText);
  const target = findTarget(text, state);

  if (isComparisonQuestion(text)) {
    return answerComparison(target, state);
  }
  return answerTotal(target, text, state);
}
