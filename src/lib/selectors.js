import { isInRange, monthKey, formatMonthLabel } from './format';
import { pendingRecurring } from './recurring';

export function expensesInRange(state, from, to) {
  return state.expenses.filter((e) => isInRange(e.date, from, to));
}

export function incomesInRange(state, from, to) {
  return state.incomes.filter((i) => isInRange(i.date, from, to));
}

export function computeTotals(state, from, to) {
  const expenses = expensesInRange(state, from, to);
  const incomes = incomesInRange(state, from, to);

  const incomeTotal = incomes.reduce((sum, i) => sum + i.amount, 0);
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  const expenseByGroup = {};
  for (const g of state.groups) expenseByGroup[g.id] = 0;
  for (const e of expenses) {
    if (e.groupId && expenseByGroup[e.groupId] !== undefined) {
      expenseByGroup[e.groupId] += e.amount;
    } else {
      expenseByGroup._sinCategoria = (expenseByGroup._sinCategoria || 0) + e.amount;
    }
  }

  const expenseBySubcategory = {};
  for (const e of expenses) {
    const key = e.subcategoryId || 'sin-subcategoria';
    expenseBySubcategory[key] = (expenseBySubcategory[key] || 0) + e.amount;
  }

  const savings = incomeTotal - expenseTotal;
  const savingsPct = incomeTotal > 0 ? (savings / incomeTotal) * 100 : 0;

  return {
    incomeTotal,
    expenseTotal,
    expenseByGroup,
    expenseBySubcategory,
    savings,
    savingsPct,
    expensesCount: expenses.length,
    incomesCount: incomes.length,
  };
}

// Serie mensual (últimos `months` meses con datos, o desde el primer
// movimiento) para el gráfico de evolución ingresos/gastos/ahorro.
export function computeMonthlySeries(state, months = 12) {
  const keys = new Set();
  for (const e of state.expenses) keys.add(monthKey(e.date));
  for (const i of state.incomes) keys.add(monthKey(i.date));

  const sortedKeys = [...keys].sort().slice(-months);

  return sortedKeys.map((key) => {
    const incomeTotal = state.incomes
      .filter((i) => monthKey(i.date) === key)
      .reduce((sum, i) => sum + i.amount, 0);
    const expenseTotal = state.expenses
      .filter((e) => monthKey(e.date) === key)
      .reduce((sum, e) => sum + e.amount, 0);
    return {
      month: key,
      label: formatMonthLabel(key + '-01'),
      Ingresos: incomeTotal,
      Gastos: expenseTotal,
      Ahorro: incomeTotal - expenseTotal,
    };
  });
}

// Nombres de persona usados en gastos (el campo opcional "Nombre" del
// formulario, ej "Mel"), para el selector del gráfico de gastos por persona.
export function personNames(state) {
  return [...new Set(state.expenses.map((e) => e.personName).filter(Boolean))].sort();
}

export function personTotal(state, from, to, personName) {
  return expensesInRange(state, from, to)
    .filter((e) => e.personName === personName)
    .reduce((sum, e) => sum + e.amount, 0);
}

// Serie mensual de gasto de una persona puntual (últimos `months` meses con
// datos de esa persona).
export function computeMonthlySeriesForPerson(state, personName, months = 8) {
  const own = state.expenses.filter((e) => e.personName === personName);
  const keys = [...new Set(own.map((e) => monthKey(e.date)))].sort().slice(-months);

  return keys.map((key) => {
    const total = own
      .filter((e) => monthKey(e.date) === key)
      .reduce((sum, e) => sum + e.amount, 0);
    return { month: key, label: formatMonthLabel(key + '-01'), Gastos: total };
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
export function monthOverMonthTotals(state) {
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
export function computeMonthBudget(state, now = new Date()) {
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

  // Para la proyección solo extrapolamos el gasto de "salidas/ocio" (lo que
  // realmente se acumula día a día). El resto — alquiler, super, servicios —
  // se toma como ya gastado del mes: no se multiplica. Se suman los
  // recurrentes que todavía falten cargar.
  const nonExtrasSpent = expenseTotal - extrasSpent;
  const pendingRecurringTotal = pendingRecurring(state).reduce((s, r) => s + (r.amount || 0), 0);

  // --- Presupuesto de extras ---
  const extrasBudget = cfg.extrasBudget || null;
  let extras = null;
  if (extrasBudget) {
    const remaining = extrasBudget - extrasSpent;
    const projected = project(extrasSpent);
    extras = {
      budget: extrasBudget,
      spent: extrasSpent,
      remaining,
      pct: extrasSpent / extrasBudget,
      projected,
      projectedPct: projected / extrasBudget,
      perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
      daysLeft,
      status: statusFor(extrasSpent / extrasBudget, projReliable ? projected / extrasBudget : 0),
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
    savings,
    coherence,
    disponible,
    hasAnyGoal: Boolean(extrasBudget || savingsGoal),
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

// verde si va y proyecta bien; rojo si ya pasó el 90% o proyecta pasarse;
// amarillo en el medio.
function statusFor(pct, projectedPct) {
  if (pct >= 0.9 || projectedPct >= 1) return 'rojo';
  if (pct >= 0.7 || projectedPct >= 0.85) return 'amarillo';
  return 'verde';
}
