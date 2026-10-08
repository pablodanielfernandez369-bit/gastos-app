import { isInRange, monthKey, formatMonthLabel } from './format.js';
import { pendingRecurring } from './recurring.js';
import { FAMILIA_GROUP_ID, PRESTAMO_GROUP_ID, TARJETAS_GROUP_ID } from './model.js';

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
  return exchanges.reduce((acc, x) => {
    const sign = x.kind === 'venta' ? -1 : 1;
    return { ars: acc.ars + sign * (x.ars || 0), usd: acc.usd + sign * (x.usd || 0) };
  }, { ars: 0, usd: 0 });
}

// Descuentos automáticos de USD por gastar de más en el mes (ver server.js
// /api/auto-deduct-cron): mismo cálculo que exchangeTotals, pero restan en
// vez de sumar dólares — se le "vende" un poquito de ahorro en dólares al
// mes para cubrir el sobregasto en pesos, al valor del día que se guardó
// en dolarHistory.
export function autoDeductionTotals(deductions) {
  return (deductions || []).reduce(
    (acc, d) => ({ ars: acc.ars + (d.ars || 0), usd: acc.usd + (d.usd || 0) }),
    { ars: 0, usd: 0 }
  );
}

// [desde, hasta] ISO (inclusive) del mes calendario de `date`. Cada mes es
// un mes aparte: ahorro, dólares, etc. nunca arrastran lo de meses anteriores.
export function monthBounds(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return [`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(last)}`];
}

// Saldo en dólares de un período: ingresos − gastos en USD, + compras −
// ventas de dólares, − descuentos automáticos.
export function usdNet(totals) {
  return totals.savingsByCurrency.usd + (totals.swaps?.usd || 0) - (totals.autoDeducted?.usd || 0);
}

export function computeTotals(rawState, from, to) {
  const state = netReimbursements(rawState);
  const swaps = exchangeTotals(exchangesInRange(state, from, to));
  const autoDeducted = autoDeductionTotals((state.autoDeductions || []).filter((d) => isInRange(d.date, from, to)));
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
    autoDeducted,
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
    items.reduce((sum, it) => sum + ((it.currency || 'ARS') === currency ? nativeAmount(it) : 0), 0);

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

// Ingresos/gastos totales y por grupo del mes calendario de `now` vs el
// anterior, para el "vs mes pasado" de las tarjetas del dashboard. Devuelve
// null en cada bucket sin base del mes anterior (no hay % contra cero).
export function monthOverMonthTotals(rawState, now = new Date()) {
  const state = netReimbursements(rawState);
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

  // Vivienda y Familia: presupuesto opcional (campo fijo en config, sin
  // selector de categoría porque el grupo ya está fijo). Igual que
  // extras/día a día, la billetera se muestra siempre que exista el
  // grupo, tenga o no presupuesto puesto.
  const viviendaGroup = state.groups.find((g) => /^vivienda$/i.test(g.name));
  const viviendaSpent = viviendaGroup
    ? monthExpenses.filter((e) => e.groupId === viviendaGroup.id).reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const viviendaBudget = cfg.viviendaBudget || null;

  const familiaGroup = state.groups.find((g) => g.id === FAMILIA_GROUP_ID);
  const familiaSpent = familiaGroup
    ? monthExpenses.filter((e) => e.groupId === familiaGroup.id).reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const familiaBudget = cfg.familiaBudget || null;

  const tarjetasGroup = state.groups.find((g) => g.id === TARJETAS_GROUP_ID);
  const tarjetasSpent = tarjetasGroup
    ? monthExpenses.filter((e) => e.groupId === tarjetasGroup.id).reduce((sum, e) => sum + e.amount, 0)
    : 0;
  const tarjetasBudget = cfg.tarjetasBudget || null;

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

  // --- Presupuesto de Vivienda (opcional) ---
  let vivienda = viviendaGroup ? { groupId: viviendaGroup.id, spent: viviendaSpent, budget: null } : null;
  if (vivienda && viviendaBudget) {
    const remaining = viviendaBudget - viviendaSpent;
    const projected = project(viviendaSpent);
    vivienda = {
      ...vivienda,
      budget: viviendaBudget,
      remaining,
      pct: viviendaSpent / viviendaBudget,
      projected,
      projectedPct: projected / viviendaBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(viviendaSpent / viviendaBudget, projReliable ? projected / viviendaBudget : 0),
    };
  }

  // --- Presupuesto de Familia (opcional) ---
  let familia = familiaGroup ? { groupId: familiaGroup.id, spent: familiaSpent, budget: null } : null;
  if (familia && familiaBudget) {
    const remaining = familiaBudget - familiaSpent;
    const projected = project(familiaSpent);
    familia = {
      ...familia,
      budget: familiaBudget,
      remaining,
      pct: familiaSpent / familiaBudget,
      projected,
      projectedPct: projected / familiaBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(familiaSpent / familiaBudget, projReliable ? projected / familiaBudget : 0),
    };
  }

  // --- Presupuesto de Tarjetas (opcional) ---
  let tarjetas = tarjetasGroup ? { groupId: tarjetasGroup.id, spent: tarjetasSpent, budget: null } : null;
  if (tarjetas && tarjetasBudget) {
    const remaining = tarjetasBudget - tarjetasSpent;
    const projected = project(tarjetasSpent);
    tarjetas = {
      ...tarjetas,
      budget: tarjetasBudget,
      remaining,
      pct: tarjetasSpent / tarjetasBudget,
      projected,
      projectedPct: projected / tarjetasBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(tarjetasSpent / tarjetasBudget, projReliable ? projected / tarjetasBudget : 0),
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
  // baja cuando cargás un gasto. Comprar/vender dólares NO lo toca (ni
  // compra ni venta): son conversiones entre el pool de pesos y el de
  // dólares, no ingreso ni gasto nuevo — el efecto de vender dólares se ve
  // solo en el pool de USD (ver exchangeTotals), nunca acá.
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
    vivienda,
    familia,
    tarjetas,
    savings,
    coherence,
    disponible,
    hasAnyGoal: Boolean(extrasBudget || savingsGoal || diaADiaBudget || viviendaBudget || familiaBudget || tarjetasBudget),
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

// "Matías" y "matias" (sin tilde, el bot de Telegram a veces la omite) son
// la misma persona: se agrupan por esta clave normalizada (sin mayúsculas
// ni acentos), aunque el nombre que se muestra respeta cómo se escribió la
// primera vez.
export function normalizePersonKey(name) {
  return (name || 'Sin nombre')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') || 'sin nombre';
}

// Balance acumulado (no mensual) de la billetera "Préstamo": cuánto se
// prestó contra cuánto repusieron en efectivo (ingresos marcados con
// groupId = Préstamo) y cuánto se condonó sin plata de por medio
// (debtSettlements). No se reinicia cada mes — es plata adelantada hasta
// que la devuelvan, no un presupuesto. "Local" (el negocio) es una
// persona más acá adentro, no un caso aparte.
export function computeLocalBalance(state) {
  const local = state.groups.find((g) => g.id === PRESTAMO_GROUP_ID);
  if (!local) return null;

  const byPerson = {};
  const bucket = (rawName) => {
    const display = (rawName || 'Sin nombre').trim() || 'Sin nombre';
    const key = normalizePersonKey(display);
    if (!byPerson[key]) byPerson[key] = { personName: display, spent: 0, reimbursed: 0, settled: 0 };
    return byPerson[key];
  };

  const loans = state.expenses.filter((e) => e.groupId === local.id);
  for (const e of loans) bucket(e.personName).spent += e.amount;

  const cashBack = state.incomes.filter((i) => i.groupId === local.id);
  for (const i of cashBack) bucket(i.personName).reimbursed += i.amount;

  const settlements = state.debtSettlements || [];
  for (const s of settlements) bucket(s.personName).settled += s.amount;

  const spent = loans.reduce((sum, e) => sum + e.amount, 0);
  const reimbursed = cashBack.reduce((sum, i) => sum + i.amount, 0);
  const settled = settlements.reduce((sum, s) => sum + s.amount, 0);

  const people = Object.values(byPerson)
    .map((p) => ({ ...p, balance: p.spent - p.reimbursed - p.settled }))
    .sort((a, b) => b.balance - a.balance);

  return {
    groupId: local.id,
    spent,
    reimbursed,
    settled,
    balance: spent - reimbursed - settled,
    people,
  };
}

// verde si va y proyecta bien; rojo si ya pasó el 90% o proyecta pasarse;
// amarillo en el medio.
export function statusFor(pct, projectedPct) {
  if (pct >= 0.9 || projectedPct >= 1) return 'rojo';
  if (pct >= 0.7 || projectedPct >= 0.85) return 'amarillo';
  return 'verde';
}

// ---- Ahorros: el único saldo que se traslada de un mes al otro ----
// Completamente manual: el saldo (pesos y dólares) es el último que el
// usuario cargó (state.savingsAnchors). Ingresos, gastos y compras/ventas
// de dólares NO lo mueven. Cada vez que se actualiza se agrega un registro
// nuevo (no pisa el anterior), así se puede ver cuánto subió o bajó mes a mes.
function savingsBalanceAt(anchors, endISO) {
  let anchor = null;
  for (const a of anchors) if (a.date <= endISO) anchor = a;
  return anchor ? { ars: anchor.ars || 0, usd: anchor.usd || 0 } : null;
}

// Saldo de Ahorros al cierre del mes de `viewDate` (el último cargado
// hasta ese mes), cuánto subió/bajó contra el cierre del mes anterior, y la
// evolución de los últimos meses. `baselineDate` viene cuando no hay cierre
// del mes anterior (el primer saldo se fijó a mitad de mes): ahí la
// variación es "desde esa fecha".
export function computeSavings(rawState, viewDate = new Date(), historyMonths = 6) {
  const anchors = (rawState.savingsAnchors || [])
    .slice()
    .sort((a, b) => (a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1));
  if (anchors.length === 0) return { hasAnchor: false };
  const first = anchors[0];

  const forMonth = (date) => {
    const end = monthBounds(date)[1];
    const balance = savingsBalanceAt(anchors, end);
    if (!balance) return { month: end.slice(0, 7), label: formatMonthLabel(end), balance: null };
    const prevEnd = monthBounds(new Date(date.getFullYear(), date.getMonth(), 0))[1];
    const prev = savingsBalanceAt(anchors, prevEnd);
    const base = prev || { ars: first.ars || 0, usd: first.usd || 0 };
    return {
      month: end.slice(0, 7),
      label: formatMonthLabel(end),
      balance,
      deltaArs: balance.ars - base.ars,
      deltaUsd: balance.usd - base.usd,
      baselineDate: prev ? null : first.date,
    };
  };

  const history = [];
  for (let i = historyMonths - 1; i >= 0; i--) {
    const m = forMonth(new Date(viewDate.getFullYear(), viewDate.getMonth() - i, 1));
    if (m.balance) history.push(m);
  }
  return { hasAnchor: true, firstDate: first.date, ...forMonth(viewDate), history };
}
