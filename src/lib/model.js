import { v4 as uuid } from 'uuid';

// ---- Modelo de datos ----
// Grupo (categoría principal): { id, name, color }
// Subcategoría: { id, groupId, name }
// Gasto: {
//   id, amount (siempre en ARS), currency ('ARS'|'USD'), amountOriginal,
//   fxRate, groupId, subcategoryId, description, date (YYYY-MM-DD),
//   type (siempre 'variable' — el campo queda por compatibilidad),
//   inputMethod ('texto'|'voz'|'formulario'|'telegram'), createdAt
// }
// Ingreso: {
//   id, amount, description, date, inputMethod, createdAt,
//   groupId — normalmente null (ingreso personal); si se marca como
//   reembolso de Local, se le pone el id del grupo "Local" y se descuenta
//   de lo gastado ahí (ver selectors.computeLocalBalance)
// }

export function defaultState() {
  const viviendaId = 'vivienda';
  const salidasId = 'salidas';
  const diaADiaId = 'diaadia';
  const localId = 'local';

  const groups = [
    { id: viviendaId, name: 'Vivienda', color: '#1F5673' },
    { id: salidasId, name: 'Salidas/Ocio', color: '#6D4B8F' },
    { id: diaADiaId, name: 'Día a día', color: '#8A6D3F' },
    { id: localId, name: 'Local', color: '#3F6E63' },
  ];

  const subcategories = [
    // Vivienda: solo lo fijo/inevitable, sin presupuesto (no tiene sentido
    // ponerle un tope a algo que no podés bajar mes a mes).
    { id: uuid(), groupId: viviendaId, name: 'Alquiler' },
    { id: uuid(), groupId: viviendaId, name: 'Expensas' },
    { id: uuid(), groupId: viviendaId, name: 'Luz' },
    { id: uuid(), groupId: viviendaId, name: 'Gas' },
    { id: uuid(), groupId: viviendaId, name: 'Otro' },

    { id: uuid(), groupId: salidasId, name: 'Comidas afuera' },
    { id: uuid(), groupId: salidasId, name: 'Delivery' },
    { id: uuid(), groupId: salidasId, name: 'Kiosko' },
    { id: uuid(), groupId: salidasId, name: 'Entretenimiento' },
    { id: uuid(), groupId: salidasId, name: 'Regalos' },
    { id: uuid(), groupId: salidasId, name: 'Otro' },

    // Día a día: gasto variable que no es salida/ocio (necesario pero no
    // fijo) — acá va el presupuesto que antes estaba en Vivienda.
    { id: uuid(), groupId: diaADiaId, name: 'Internet' },
    { id: uuid(), groupId: diaADiaId, name: 'Agua' },
    { id: uuid(), groupId: diaADiaId, name: 'Súper' },
    { id: uuid(), groupId: diaADiaId, name: 'Verdulería' },
    { id: uuid(), groupId: diaADiaId, name: 'Ferretería' },
    { id: uuid(), groupId: diaADiaId, name: 'Psicólogo' },
    { id: uuid(), groupId: diaADiaId, name: 'Otro' },
  ];

  return {
    version: 1,
    groups,
    subcategories,
    expenses: [],
    incomes: [],
    exchanges: [], // compras de USD con pesos: { id, date, usd, rate, ars, description }
    recurring: [], // gastos fijos recurrentes: { id, groupId, subcategoryId, description, amount, dayOfMonth }
    config: {
      fxRate: null, // última cotización USD->ARS usada al cargar un gasto en USD
      fxRateManual: null, // cotización que el usuario fija a mano (pisa al blue)
      savingsGoal: null, // meta de ahorro mensual en ARS
      extrasBudget: null, // presupuesto mensual para gastos extras/salidas en ARS
      extrasGroupId: salidasId, // qué grupo cuenta como "extras" para el presupuesto
      diaADiaBudget: null, // presupuesto mensual para gastos variables del día a día en ARS
      diaADiaGroupId: diaADiaId, // qué grupo cuenta como "día a día" para el presupuesto
    },
  };
}

export function newExpense(partial) {
  return {
    id: uuid(),
    amount: 0,
    currency: 'ARS',
    amountOriginal: null,
    fxRate: null,
    groupId: null,
    subcategoryId: null,
    description: '',
    personName: null, // etiqueta opcional (ej: "Mel") para poder preguntarle al asistente por nombre
    date: todayISO(),
    type: 'variable',
    inputMethod: 'formulario',
    recurringId: null,
    createdAt: Date.now(),
    ...partial,
  };
}

export function newRecurring(partial) {
  return {
    id: uuid(),
    groupId: null,
    subcategoryId: null,
    description: '',
    amount: 0,
    dayOfMonth: 10,
    ...partial,
  };
}

// Compra de dólares con pesos ahorrados: no es ingreso ni gasto, solo pasa
// plata del pool de pesos al de dólares. `ars` es lo que salió en pesos.
export function newExchange(partial) {
  return {
    id: uuid(),
    date: todayISO(),
    usd: 0,
    rate: 0,
    ars: 0,
    description: '',
    createdAt: Date.now(),
    ...partial,
  };
}

export function newIncome(partial) {
  return {
    id: uuid(),
    amount: 0,
    currency: 'ARS',
    amountOriginal: null,
    fxRate: null,
    description: '',
    date: todayISO(),
    inputMethod: 'formulario',
    groupId: null,
    createdAt: Date.now(),
    ...partial,
  };
}

// "Hoy" siempre en hora de Argentina, no importa la zona del dispositivo:
// así un gasto cargado a la noche no salta al día siguiente.
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
