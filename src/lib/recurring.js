import { monthKey } from './format';

// Un gasto fijo recurrente (alquiler, expensas, luz...) está "cumplido" en
// el mes actual si existe algún gasto cargado que lo referencia por
// `recurringId` (se asigna al cargarlo desde el recordatorio).
export function pendingRecurring(state) {
  const currentMonth = monthKey(new Date().toISOString().slice(0, 10));
  const day = new Date().getDate();

  return state.recurring.filter((r) => {
    if (day < r.dayOfMonth) return false;
    const alreadyLogged = state.expenses.some(
      (e) => e.recurringId === r.id && monthKey(e.date) === currentMonth
    );
    return !alreadyLogged;
  });
}
