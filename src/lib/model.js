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
// Ingreso: { id, amount, description, date, inputMethod, createdAt }

export function defaultState() {
  const viviendaId = 'vivienda';
  const salidasId = 'salidas';

  const groups = [
    { id: viviendaId, name: 'Vivienda', color: '#1F5673' },
    { id: salidasId, name: 'Salidas/Ocio', color: '#6D4B8F' },
  ];

  const subcategories = [
    { id: uuid(), groupId: viviendaId, name: 'Alquiler' },
    { id: uuid(), groupId: viviendaId, name: 'Expensas' },
    { id: uuid(), groupId: viviendaId, name: 'Luz' },
    { id: uuid(), groupId: viviendaId, name: 'Gas' },
    { id: uuid(), groupId: viviendaId, name: 'Internet' },
    { id: uuid(), groupId: viviendaId, name: 'Agua' },
    { id: uuid(), groupId: viviendaId, name: 'Otro' },

    { id: uuid(), groupId: salidasId, name: 'Comidas afuera' },
    { id: uuid(), groupId: salidasId, name: 'Delivery' },
    { id: uuid(), groupId: salidasId, name: 'Kiosko' },
    { id: uuid(), groupId: salidasId, name: 'Entretenimiento' },
    { id: uuid(), groupId: salidasId, name: 'Regalos' },
    { id: uuid(), groupId: salidasId, name: 'Otro' },
  ];

  return {
    version: 1,
    groups,
    subcategories,
    expenses: [],
    incomes: [],
    recurring: [], // gastos fijos recurrentes: { id, groupId, subcategoryId, description, amount, dayOfMonth }
    config: {
      fxRate: null, // última cotización USD->ARS usada al cargar un gasto en USD
      fxRateManual: null, // cotización que el usuario fija a mano (pisa al blue)
      savingsGoal: null, // meta de ahorro mensual en ARS
      extrasBudget: null, // presupuesto mensual para gastos extras/salidas en ARS
      extrasGroupId: salidasId, // qué grupo cuenta como "extras" para el presupuesto
      viviendaBudget: null, // presupuesto mensual para gastos de vivienda en ARS
      viviendaGroupId: viviendaId, // qué grupo cuenta como "vivienda" para el presupuesto
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
    createdAt: Date.now(),
    ...partial,
  };
}

// "Hoy" siempre en hora de Argentina, no importa la zona del dispositivo:
// así un gasto cargado a la noche no salta al día siguiente.
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
