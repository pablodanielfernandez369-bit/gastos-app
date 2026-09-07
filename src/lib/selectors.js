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

  // Los gastos fijos (alquiler, expensas...) se pagan una vez al mes: no tiene
  // sentido proyectarlos a fin de mes. Solo se proyecta lo variable/puntual.
  // A los fijos ya cargados les sumamos los recurrentes que todavía faltan.
  const sumBy = (pred) => monthExpenses.filter(pred).reduce((s, e) => s + e.amount, 0);
  const fixedTotal = sumBy((e) => e.type === 'fijo');
  const pendingFixed = pendingRecurring(state).reduce((s, r) => s + (r.amount || 0), 0);
  const projectExpense = (variable) => fixedTotal + pendingFixed + project(variable);

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
    const projectedExpense = projectExpense(expenseTotal - fixedTotal);
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

  // --- Coherencia del plan: SIN proyectar nada, solo números reales. ---
  // ¿El ingreso del mes alcanza para: la meta de ahorro + los gastos fijos
  // (los ya cargados + los recurrentes que faltan) + el tope de extras?
  // Si esto no cierra, el plan es imposible por diseño, no por el ritmo.
  let coherence = null;
  if (savingsGoal && extrasBudget && incomeTotal > 0) {
    const fixedKnown = fixedTotal + pendingFixed;
    const needed = savingsGoal + fixedKnown + extrasBudget;
    coherence = {
      fits: needed <= incomeTotal,
      gap: needed - incomeTotal,
      freeForExtras: incomeTotal - savingsGoal - fixedKnown,
    };
  }

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
    hasAnyGoal: Boolean(extrasBudget || savingsGoal),
  };
}

// verde si va y proyecta bien; rojo si ya pasó el 90% o proyecta pasarse;
// amarillo en el medio.
function statusFor(pct, projectedPct) {
  if (pct >= 0.9 || projectedPct >= 1) return 'rojo';
  if (pct >= 0.7 || projectedPct >= 0.85) return 'amarillo';
  return 'verde';
}
