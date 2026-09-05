import { isInRange, monthKey, formatMonthLabel } from './format';

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
