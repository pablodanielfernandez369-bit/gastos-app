// Analizador local de preguntas sobre los gastos/ingresos, sin IA externa:
// reconoce de qué categoría/subcategoría y/o nombre habla la pregunta (los
// dos se pueden combinar: "peaje" solo, o "peaje de Mel"), qué período pide
// (hoy/semana/mes/año) y si es una comparación mes a mes, y arma la
// respuesta directamente a partir de los datos guardados en el dispositivo.

import { formatARS, isInRange } from './format.js';

function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function monthRange(offsetMonths) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const first = new Date(target.getFullYear(), target.getMonth(), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  return [toISO(first), toISO(last)];
}

function weekRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toISO(monday), toISO(sunday)];
}

function yearRange() {
  const now = new Date();
  return [toISO(new Date(now.getFullYear(), 0, 1)), toISO(new Date(now.getFullYear(), 11, 31))];
}

function todayRange() {
  const iso = toISO(new Date());
  return [iso, iso];
}

function toISO(d) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
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
  if (containsWord(text, 'hoy')) return { key: 'dia', label: 'hoy' };
  if (text.includes('esta semana')) return { key: 'semana', label: 'esta semana' };
  if (containsWord(text, 'ano') || containsWord(text, 'anio')) return { key: 'anio', label: 'este año' };
  return { key: 'mes', label: 'este mes' };
}

function periodToRange(periodKey) {
  if (periodKey === 'dia') return todayRange();
  if (periodKey === 'semana') return weekRange();
  if (periodKey === 'mes_pasado') return monthRange(-1);
  if (periodKey === 'anio') return yearRange();
  return monthRange(0);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matchea por palabra completa (con límites \b), no por substring suelto
// (evita que "gas" matchee dentro de "gasté"), y tolera singular/plural
// simple sacando una "s" final si la tiene: "Peajes" matchea "peaje" o
// "peajes", "Insumo" matchea "insumo" o "insumos".
function containsWord(text, phrase) {
  if (!phrase) return false;
  const base = phrase.endsWith('s') ? phrase.slice(0, -1) : phrase;
  return new RegExp(`\\b${escapeRegex(base)}s?\\b`).test(text);
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
// usás como etiqueta recurrente y después solo revisa si la pregunta las
// menciona, en cualquier lugar y con cualquier verbo.
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
      return { keyword: word, name: capitalize(word) };
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
      return { keyword: name, name: capitalize(name) };
    }
  }
  return null;
}

function findCategoryMatch(text, state) {
  const subs = [...state.subcategories].sort((a, b) => b.name.length - a.name.length);
  for (const s of subs) {
    const name = normalize(s.name);
    if (name && name !== 'otro' && containsWord(text, name)) {
      return { subcategoryId: s.id, groupId: s.groupId, label: s.name };
    }
  }
  for (const g of state.groups) {
    if (containsWord(text, normalize(g.name))) {
      return { groupId: g.id, label: g.name };
    }
  }
  if (containsWord(text, 'negocio') || containsWord(text, 'local')) {
    const local = state.groups.find((g) => g.id === 'local');
    if (local) return { groupId: local.id, label: local.name };
  }
  return null;
}

// Junta todas las pistas de la pregunta: categoría (subcategoría o grupo) Y
// nombre pueden aparecer juntos ("peaje de Mel") o por separado ("peaje" a
// secas trae los de todos; "Mel" a secas trae todos los gastos de Mel).
function buildQuery(text, state) {
  const category = findCategoryMatch(text, state);
  const person = findPersonMatch(text, state);
  // El texto libre de la descripción solo se usa si no hay nada más
  // específico (categoría o nombre dedicado) para no pisar esas señales.
  const description = !category && !person ? findDescriptionMatch(text, state) : null;
  return { category, person, description };
}

function queryLabel({ category, person, description }) {
  if (category && person) return `${category.label} de ${person.name}`;
  if (category) return category.label;
  if (person) return person.name;
  if (description) return description.name;
  return null;
}

function queryFilter({ category, person, description }) {
  const filter = {};
  if (category?.subcategoryId) filter.subcategoryId = category.subcategoryId;
  else if (category?.groupId) filter.groupId = category.groupId;
  if (person) filter.personKeyword = person.keyword;
  if (description) filter.descriptionKeyword = description.keyword;
  return filter;
}

function matchesFilter(e, filter) {
  if (filter.subcategoryId && e.subcategoryId !== filter.subcategoryId) return false;
  if (filter.groupId && e.groupId !== filter.groupId) return false;
  if (filter.personKeyword && !containsWord(normalize(e.personName || ''), filter.personKeyword)) return false;
  if (filter.descriptionKeyword && !containsWord(normalize(e.description || ''), filter.descriptionKeyword)) return false;
  return true;
}

function sumExpenses(state, from, to, filter) {
  return state.expenses
    .filter((e) => isInRange(e.date, from, to) && matchesFilter(e, filter))
    .reduce((sum, e) => sum + e.amount, 0);
}

function sumIncomes(state, from, to) {
  return state.incomes
    .filter((i) => isInRange(i.date, from, to))
    .reduce((sum, i) => sum + i.amount, 0);
}

function answerExpenseComparison(filter, label, state) {
  const [prevFrom, prevTo] = monthRange(-1);
  const [currFrom, currTo] = monthRange(0);
  const prev = sumExpenses(state, prevFrom, prevTo, filter);
  const curr = sumExpenses(state, currFrom, currTo, filter);

  const de = label ? ` de ${label}` : '';
  if (prev === 0 && curr === 0) {
    return `No tengo gastos${de} ni este mes ni el mes pasado.`;
  }
  if (prev === 0) {
    return `El mes pasado no tenías gastos${de}, y este mes van ${formatARS(curr)}.`;
  }
  return comparisonSentence(label ? capitalize(label) : 'Tus gastos', prev, curr);
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

function answerExpenseTotal(filter, label, text, state) {
  const period = detectPeriod(text);
  const [from, to] = periodToRange(period.key);
  const total = sumExpenses(state, from, to, filter);
  if (!label) return `${capitalizePeriod(period.label)} gastaste un total de ${formatARS(total)}.`;
  return `${capitalizePeriod(period.label)} gastaste ${formatARS(total)} en ${label}.`;
}

function answerSavingsComparison(state) {
  const [prevFrom, prevTo] = monthRange(-1);
  const [currFrom, currTo] = monthRange(0);
  const prev = sumIncomes(state, prevFrom, prevTo) - sumExpenses(state, prevFrom, prevTo, {});
  const curr = sumIncomes(state, currFrom, currTo) - sumExpenses(state, currFrom, currTo, {});
  return comparisonSentence('Tu ahorro', prev, curr, true);
}

function answerSavingsTotal(text, state) {
  const period = detectPeriod(text);
  const [from, to] = periodToRange(period.key);
  const income = sumIncomes(state, from, to);
  const expense = sumExpenses(state, from, to, {});
  const savings = income - expense;
  return `${capitalizePeriod(period.label)} tu ahorro es de ${formatARS(savings)} (ingresos ${formatARS(income)}, gastos ${formatARS(expense)}).`;
}

function answerIncomeComparison(state) {
  const [prevFrom, prevTo] = monthRange(-1);
  const [currFrom, currTo] = monthRange(0);
  const prev = sumIncomes(state, prevFrom, prevTo);
  const curr = sumIncomes(state, currFrom, currTo);
  return comparisonSentence('Tus ingresos', prev, curr);
}

function answerIncomeTotal(text, state) {
  const period = detectPeriod(text);
  const [from, to] = periodToRange(period.key);
  const total = sumIncomes(state, from, to);
  return `${capitalizePeriod(period.label)} cobraste ${formatARS(total)}.`;
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
  const query = buildQuery(text, state);
  const comparison = isComparisonQuestion(text);

  if (!query.category && !query.person && !query.description) {
    if (/\bahorr/.test(text)) return comparison ? answerSavingsComparison(state) : answerSavingsTotal(text, state);
    if (/\bingres|\bgan[eé]\b|\bcobr/.test(text)) return comparison ? answerIncomeComparison(state) : answerIncomeTotal(text, state);
  }

  const filter = queryFilter(query);
  const label = queryLabel(query);
  return comparison
    ? answerExpenseComparison(filter, label, state)
    : answerExpenseTotal(filter, label, text, state);
}
