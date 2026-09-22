import { isInRange, monthKey, formatMonthLabel } from './format';
import { pendingRecurring } from './recurring';

// Monto en su moneda original (ARS o USD), sin convertir. Se usa en todos
// lados donde pesos y dólares se cuentan por separado.
function nativeAmount(item) {
  return item.currency === 'USD' ? item.amountOriginal || 0 : item.amount;
}

// Un ingreso con groupId es un reembolso (ej. "me repusieron plata del
// local"): no es plata nueva, es plata propia que volvió. Se lo saca de los
// ingresos y se lo resta del gasto de ese grupo como un gasto negativo.
// computeLocalBalance mira el estado crudo (acumulado), no éste.
export function netReimbursements(state) {
  if (!state.incomes.some((i) => i.groupId)) return state;
  const refunds = state.incomes.filter((i) => i.groupId);
  return {
    ...state,
    incomes: state.incomes.filter((i) => !i.groupId),
    expenses: [
      ...state.expenses,
      ...refunds.map((i) => ({
        ...i,
        description: i.description || 'Reposición',
        amount: -i.amount,
        amountOriginal: i.amountOriginal != null ? -i.amountOriginal : i.amountOriginal,
        subcategoryId: null,
      })),
    ],
  };
}

export function expensesInRange(state, from, to) {
  return state.expenses.filter((e) => isInRange(e.date, from, to));
}

export function incomesInRange(state, from, to) {
  return state.incomes.filter((i) => isInRange(i.date, from, to));
}

// Ingresos en ARS y en USD por separado, sin convertir uno al otro: la
// "ARS" suma los ingresos cargados en pesos, la "USD" suma el monto
// original en dólares de los cargados en esa moneda.
export function incomeTotalsByCurrency(incomes) {
  let ars = 0;
  let usd = 0;
  for (const i of incomes) {
    if (i.currency === 'USD') usd += i.amountOriginal || 0;
    else ars += i.amount;
  }
  return { ars, usd };
}

// Mismo criterio para gastos: un gasto en USD descuenta del pool de
// dólares, uno en ARS descuenta del pool de pesos. Sin conversión.
export function expenseTotalsByCurrency(expenses) {
  let ars = 0;
  let usd = 0;
  for (const e of expenses) {
    if (e.currency === 'USD') usd += e.amountOriginal || 0;
    else ars += e.amount;
  }
  return { ars, usd };
}

// Compras de USD hechas con pesos. Siguen contando como ahorro en pesos (al
// valor con que se compraron); solo se informa cuánto de ese ahorro está en
// dólares y cuánto quedó líquido en pesos. No tocan ingresos ni gastos.
export function exchangesInRange(state, from, to) {
  return (state.exchanges || []).filter((x) => isInRange(x.date, from, to));
}

export function exchangeTotals(exchanges) {
  return exchanges.reduce(
    (acc, x) => ({ ars: acc.ars + (x.ars || 0), usd: acc.usd + (x.usd || 0) }),
    { ars: 0, usd: 0 }
  );
}

export function computeTotals(rawState, from, to) {
  const state = netReimbursements(rawState);
  const swaps = exchangeTotals(exchangesInRange(state, from, to));
  const expenses = expensesInRange(state, from, to);
  const incomes = incomesInRange(state, from, to);

  const incomeTotal = incomes.reduce((sum, i) => sum + i.amount, 0);
  const incomeByCurrency = incomeTotalsByCurrency(incomes);
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expenseByCurrency = expenseTotalsByCurrency(expenses);
  const savingsByCurrency = {
    ars: incomeByCurrency.ars - expenseByCurrency.ars,
    usd: incomeByCurrency.usd - expenseByCurrency.usd,
  };

  // Por grupo, también separado por moneda: un gasto en USD no le suma
  // pesos al grupo, le suma dólares.
  const emptyBucket = () => ({ ars: 0, usd: 0 });
  const addToBucket = (bucket, e) => {
    if (e.currency === 'USD') bucket.usd += e.amountOriginal || 0;
    else bucket.ars += e.amount;
  };
  const expenseByGroup = {};
  for (const g of state.groups) expenseByGroup[g.id] = emptyBucket();
  expenseByGroup._sinCategoria = emptyBucket();
  for (const e of expenses) {
    if (e.groupId && expenseByGroup[e.groupId] !== undefined) {
      addToBucket(expenseByGroup[e.groupId], e);
    } else {
      addToBucket(expenseByGroup._sinCategoria, e);
    }
  }

  const expenseBySubcategory = {};
  for (const e of expenses) {
    const key = e.subcategoryId || 'sin-subcategoria';
    if (!expenseBySubcategory[key]) expenseBySubcategory[key] = emptyBucket();
    addToBucket(expenseBySubcategory[key], e);
  }

  const savings = incomeTotal - expenseTotal;
  const savingsPct = incomeTotal > 0 ? (savings / incomeTotal) * 100 : 0;

  return {
    incomeTotal,
    incomeByCurrency,
    expenseTotal,
    expenseByCurrency,
    savingsByCurrency,
    swaps,
    expenseByGroup,
    expenseBySubcategory,
    savings,
    savingsPct,
    expensesCount: expenses.length,
    incomesCount: incomes.length,
  };
}

// Serie mensual (últimos `months` meses con datos, o desde el primer
// movimiento) para el gráfico de evolución ingresos/gastos/ahorro, separada
// en pesos y en dólares (sin convertir uno al otro).
export function computeMonthlySeries(rawState, months = 12) {
  const state = netReimbursements(rawState);
  const keys = new Set();
  for (const e of state.expenses) keys.add(monthKey(e.date));
  for (const i of state.incomes) keys.add(monthKey(i.date));
  for (const x of state.exchanges || []) keys.add(monthKey(x.date));

  const sortedKeys = [...keys].sort().slice(-months);

  const sumNative = (items, currency) =>
    items.reduce((sum, it) => sum + (it.currency === currency ? nativeAmount(it) : 0), 0);

  return sortedKeys.map((key) => {
    const monthIncomes = state.incomes.filter((i) => monthKey(i.date) === key);
    const monthExpenses = state.expenses.filter((e) => monthKey(e.date) === key);
    const incomeArs = sumNative(monthIncomes, 'ARS');
    const incomeUsd = sumNative(monthIncomes, 'USD');
    const expenseArs = sumNative(monthExpenses, 'ARS');
    const expenseUsd = sumNative(monthExpenses, 'USD');
    return {
      month: key,
      label: formatMonthLabel(key + '-01'),
      Ingresos: incomeArs,
      Gastos: expenseArs,
      Ahorro: incomeArs - expenseArs,
      IngresosUSD: incomeUsd,
      GastosUSD: expenseUsd,
      AhorroUSD: incomeUsd - expenseUsd,
    };
  });
}

// Nombres de persona usados en gastos (el campo opcional "Nombre" del
// formulario, ej "Mel"), para el selector del gráfico de gastos por persona.
export function personNames(state) {
  return [...new Set(state.expenses.map((e) => e.personName).filter(Boolean))].sort();
}

// Total en pesos y en dólares por separado.
export function personTotal(state, from, to, personName) {
  const own = expensesInRange(state, from, to).filter((e) => e.personName === personName);
  return {
    ars: own.filter((e) => e.currency !== 'USD').reduce((sum, e) => sum + e.amount, 0),
    usd: own.filter((e) => e.currency === 'USD').reduce((sum, e) => sum + (e.amountOriginal || 0), 0),
  };
}

// Serie mensual de gasto de una persona puntual (últimos `months` meses con
// datos de esa persona), separada en pesos y en dólares.
export function computeMonthlySeriesForPerson(state, personName, months = 8) {
  const own = state.expenses.filter((e) => e.personName === personName);
  const keys = [...new Set(own.map((e) => monthKey(e.date)))].sort().slice(-months);

  return keys.map((key) => {
    const monthOwn = own.filter((e) => monthKey(e.date) === key);
    const ars = monthOwn.filter((e) => e.currency !== 'USD').reduce((sum, e) => sum + e.amount, 0);
    const usd = monthOwn.filter((e) => e.currency === 'USD').reduce((sum, e) => sum + (e.amountOriginal || 0), 0);
    return { month: key, label: formatMonthLabel(key + '-01'), Gastos: ars, GastosUSD: usd };
  });
}

// Compara cada subcategoría entre el mes calendario actual y el anterior,
// para poder avisar "esto subió/bajó respecto al mes pasado". Solo incluye
// subcategorías que tenían gasto en el mes anterior (si no, no hay base
// real para comparar un %).
export function subcategoryMonthComparison(state) {
  const now = new Date();
  const currKey = monthKeyOf(now);
  const prevKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const sums = {};
  for (const e of state.expenses) {
    const mk = monthKey(e.date);
    if (mk !== currKey && mk !== prevKey) continue;
    const key = e.subcategoryId || 'sin-subcategoria';
    if (!sums[key]) sums[key] = { curr: 0, prev: 0 };
    sums[key][mk === currKey ? 'curr' : 'prev'] += e.amount;
  }

  return Object.entries(sums)
    .filter(([, v]) => v.prev > 0)
    .map(([subId, v]) => {
      const sub = state.subcategories.find((s) => s.id === subId);
      return {
        subcategoryId: subId,
        name: sub ? sub.name : 'Sin subcategoría',
        groupId: sub?.groupId ?? null,
        prev: v.prev,
        curr: v.curr,
        deltaPct: ((v.curr - v.prev) / v.prev) * 100,
      };
    })
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Ingresos/gastos totales y por grupo del mes calendario actual vs el
// anterior, para el "vs mes pasado" de las tarjetas del dashboard. Devuelve
// null en cada bucket sin base del mes anterior (no hay % contra cero).
export function monthOverMonthTotals(rawState) {
  const state = netReimbursements(rawState);
  const now = new Date();
  const currKey = monthKeyOf(now);
  const prevKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const bucket = () => ({ curr: 0, prev: 0 });
  const income = bucket();
  const expense = bucket();
  const byGroup = {};
  for (const g of state.groups) byGroup[g.id] = bucket();

  for (const i of state.incomes) {
    const mk = monthKey(i.date);
    if (mk === currKey) income.curr += i.amount;
    else if (mk === prevKey) income.prev += i.amount;
  }
  for (const e of state.expenses) {
    const mk = monthKey(e.date);
    if (mk !== currKey && mk !== prevKey) continue;
    const field = mk === currKey ? 'curr' : 'prev';
    expense[field] += e.amount;
    if (e.groupId && byGroup[e.groupId]) byGroup[e.groupId][field] += e.amount;
  }

  const withDelta = (b) => (b.prev > 0 ? { ...b, deltaPct: ((b.curr - b.prev) / b.prev) * 100 } : null);

  const groupDeltas = {};
  for (const id of Object.keys(byGroup)) groupDeltas[id] = withDelta(byGroup[id]);

  return { income: withDelta(income), expense: withDelta(expense), byGroup: groupDeltas };
}

// Estado de las metas del mes calendario en curso: cuánto se lleva gastado en
// "extras" vs el presupuesto, proyección a fin de mes según el ritmo actual,
// cuánto queda por día, y cómo viene la meta de ahorro.
export function computeMonthBudget(rawState, now = new Date()) {
  const state = netReimbursements(rawState);
  const cfg = state.config || {};
  const currKey = monthKeyOf(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const monthProgress = dayOfMonth / daysInMonth; // 0..1
  const project = (v) => (monthProgress > 0 ? v / monthProgress : v);
  // Los primeros días del mes la proyección lineal es muy inestable (multiplica
  // lo poco gastado por un número grande): no la usamos para nada hasta que
  // haya pasado un tercio del mes.
  const projReliable = dayOfMonth >= 10;

  const inMonth = (iso) => monthKey(iso) === currKey;
  const monthExpenses = state.expenses.filter((e) => inMonth(e.date));
  const monthIncomes = state.incomes.filter((i) => inMonth(i.date));

  const incomeTotal = monthIncomes.reduce((sum, i) => sum + i.amount, 0);
  const expenseTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const extrasGroupId = cfg.extrasGroupId || null;
  const extrasSpent = monthExpenses
    .filter((e) => e.groupId === extrasGroupId)
    .reduce((sum, e) => sum + e.amount, 0);

  // Vivienda no tiene presupuesto (es lo fijo/inevitable), pero para la
  // billetera igual se muestra cuánto se lleva gastado este mes.
  const viviendaGroup = state.groups.find((g) => /^vivienda$/i.test(g.name));
  const viviendaSpent = viviendaGroup
    ? monthExpenses.filter((e) => e.groupId === viviendaGroup.id).reduce((sum, e) => sum + e.amount, 0)
    : 0;

  // Para la proyección solo extrapolamos el gasto de "salidas/ocio" (lo que
  // realmente se acumula día a día). El resto — alquiler, super, servicios —
  // se toma como ya gastado del mes: no se multiplica. Se suman los
  // recurrentes que todavía falten cargar.
  const nonExtrasSpent = expenseTotal - extrasSpent;
  const pendingRecurringTotal = pendingRecurring(state).reduce((s, r) => s + (r.amount || 0), 0);

  // --- Presupuesto de extras ---
  // La billetera se muestra siempre que exista el grupo, tenga o no
  // presupuesto puesto (sin presupuesto solo se ve el gasto, sin barra).
  const extrasBudget = cfg.extrasBudget || null;
  let extras = extrasGroupId ? { groupId: extrasGroupId, spent: extrasSpent, budget: null } : null;
  if (extras && extrasBudget) {
    const remaining = extrasBudget - extrasSpent;
    const projected = project(extrasSpent);
    extras = {
      ...extras,
      budget: extrasBudget,
      remaining,
      pct: extrasSpent / extrasBudget,
      projected,
      projectedPct: projected / extrasBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(extrasSpent / extrasBudget, projReliable ? projected / extrasBudget : 0),
    };
  }

  // --- Presupuesto de "Día a día" (gasto variable que no es Vivienda ni
  // Salidas/Ocio: súper, verdulería, ferretería, psicólogo, etc) ---
  const diaADiaGroupId = cfg.diaADiaGroupId || null;
  const diaADiaSpent = monthExpenses
    .filter((e) => e.groupId === diaADiaGroupId)
    .reduce((sum, e) => sum + e.amount, 0);
  const diaADiaBudget = cfg.diaADiaBudget || null;
  let diaADia = diaADiaGroupId ? { groupId: diaADiaGroupId, spent: diaADiaSpent, budget: null } : null;
  if (diaADia && diaADiaBudget) {
    const remaining = diaADiaBudget - diaADiaSpent;
    const projected = project(diaADiaSpent);
    diaADia = {
      ...diaADia,
      budget: diaADiaBudget,
      remaining,
      pct: diaADiaSpent / diaADiaBudget,
      projected,
      projectedPct: projected / diaADiaBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(diaADiaSpent / diaADiaBudget, projReliable ? projected / diaADiaBudget : 0),
    };
  }

  // --- Meta de ahorro ---
  const savingsGoal = cfg.savingsGoal || null;
  let savings = null;
  if (savingsGoal) {
    const current = incomeTotal - expenseTotal;
    const projectedExpense = nonExtrasSpent + pendingRecurringTotal + project(extrasSpent);
    const projected = incomeTotal - projectedExpense; // asume ingreso ya cargado
    savings = {
      goal: savingsGoal,
      current,
      projected,
      pct: current / savingsGoal,
      projectedPct: projected / savingsGoal,
      onTrack: !projReliable || projected >= savingsGoal,
    };
  }

  // --- Coherencia del plan: solo a partir de mitad de mes, cuando ya está
  // cargado casi todo el gasto no-discrecional del mes. ¿El ingreso alcanza
  // para lo ya gastado (sin salidas) + la meta de ahorro + el tope de salidas? ---
  let coherence = null;
  if (savingsGoal && extrasBudget && incomeTotal > 0 && dayOfMonth >= 15) {
    const needed = savingsGoal + nonExtrasSpent + pendingRecurringTotal + extrasBudget;
    coherence = {
      fits: needed <= incomeTotal,
      gap: needed - incomeTotal,
      freeForExtras: incomeTotal - savingsGoal - nonExtrasSpent - pendingRecurringTotal,
    };
  }

  // --- Disponible para gastar, en vivo ---
  // Pensado para ingresos irregulares (no un sueldo fijo a principio de
  // mes): no proyecta nada, solo resta de lo que YA entró lo que ya se
  // gastó, la meta de ahorro (se aparta entera, no prorrateada) y los
  // recurrentes que todavía falten pagar este mes. Sube cuando cobrás,
  // baja cuando cargás un gasto.
  const disponible = {
    value: incomeTotal - expenseTotal - (savingsGoal || 0) - pendingRecurringTotal,
    incomeTotal,
    expenseTotal,
    savingsGoal: savingsGoal || 0,
    pendingRecurringTotal,
  };

  return {
    monthKey: currKey,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    monthProgress,
    projReliable,
    incomeTotal,
    expenseTotal,
    extras,
    diaADia,
    vivienda: viviendaGroup ? { groupId: viviendaGroup.id, spent: viviendaSpent } : null,
    savings,
    coherence,
    disponible,
    hasAnyGoal: Boolean(extrasBudget || savingsGoal || diaADiaBudget),
  };
}

// Racha de días seguidos (dentro del mes en curso) en los que el gasto de
// "salidas/ocio" de ese día no pasó la parte que le toca del presupuesto
// mensual. Se reinicia cada mes (no hay forma confiable de saber si un
// presupuesto anterior a que Pablo lo configurara habría dado streak).
// El día de hoy no cuenta todavía (sigue en curso) — se informa aparte.
export function computeStreak(state, now = new Date()) {
  const cfg = state.config || {};
  const extrasBudget = cfg.extrasBudget;
  const extrasGroupId = cfg.extrasGroupId;
  if (!extrasBudget || !extrasGroupId) return null;

  const currKey = monthKeyOf(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyAllotment = extrasBudget / daysInMonth;

  const spentByDay = {};
  for (const e of state.expenses) {
    if (e.groupId !== extrasGroupId || monthKey(e.date) !== currKey) continue;
    spentByDay[e.date] = (spentByDay[e.date] || 0) + e.amount;
  }

  let streak = 0;
  for (let d = now.getDate() - 1; d >= 1; d--) {
    const dateStr = `${currKey}-${String(d).padStart(2, '0')}`;
    if ((spentByDay[dateStr] || 0) <= dailyAllotment) streak++;
    else break;
  }

  const todayStr = `${currKey}-${String(now.getDate()).padStart(2, '0')}`;
  const todaySpent = spentByDay[todayStr] || 0;
  return { streak, dailyAllotment, todaySpent, onTrackToday: todaySpent <= dailyAllotment };
}

// Balance acumulado (no mensual) del grupo "Local": cuánto se gastó ahí
// contra cuánto se repuso (ingresos marcados con groupId = Local). No se
// reinicia cada mes — es plata adelantada por Pablo hasta que se la
// devuelvan, no un presupuesto.
export function computeLocalBalance(state) {
  const local = state.groups.find((g) => /^local$/i.test(g.name));
  if (!local) return null;

  const spent = state.expenses
    .filter((e) => e.groupId === local.id)
    .reduce((sum, e) => sum + e.amount, 0);
  const reimbursed = state.incomes
    .filter((i) => i.groupId === local.id)
    .reduce((sum, i) => sum + i.amount, 0);

  return { groupId: local.id, spent, reimbursed, balance: spent - reimbursed };
}

// verde si va y proyecta bien; rojo si ya pasó el 90% o proyecta pasarse;
// amarillo en el medio.
function statusFor(pct, projectedPct) {
  if (pct >= 0.9 || projectedPct >= 1) return 'rojo';
  if (pct >= 0.7 || projectedPct >= 0.85) return 'amarillo';
  return 'verde';
}
