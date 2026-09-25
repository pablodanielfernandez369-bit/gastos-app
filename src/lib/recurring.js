import { monthKey } from './format.js';

// Un gasto fijo recurrente (alquiler, expensas, luz...) está "cumplido" en
// el mes actual si existe algún gasto cargado que lo referencia por
// `recurringId` (se asigna al cargarlo desde el recordatorio con "Cargar
// ahora"), O si Pablo lo cargó por el flujo normal y tocó "Ya lo cargué"
// para avisar que ese mes ya está — sin eso, el recordatorio no tiene
// forma de saber que ya está pagado y seguiría insistiendo. El mes
// siguiente vuelve a aparecer solo: esto no lo "apaga" para siempre, solo
// para el mes en que se tocó.
export function pendingRecurring(state) {
  const currentMonth = monthKey(new Date().toISOString().slice(0, 10));
  const day = new Date().getDate();

  return state.recurring.filter((r) => {
    if (day < r.dayOfMonth) return false;
    if ((r.dismissedMonths || []).includes(currentMonth)) return false;
    const alreadyLogged = state.expenses.some(
      (e) => e.recurringId === r.id && monthKey(e.date) === currentMonth
    );
    return !alreadyLogged;
  });
}
