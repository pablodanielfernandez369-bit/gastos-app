import { v4 as uuid } from 'uuid';

// ---- Modelo de datos ----
// Grupo (categoría principal): { id, name, color }
// Subcategoría: { id, groupId, name }
// Gasto: {
//   id, amount (siempre en ARS), currency ('ARS'|'USD'), amountOriginal,
//   fxRate, groupId, subcategoryId, description, date (YYYY-MM-DD),
//   type ('fijo'|'variable'|'puntual'), inputMethod ('texto'|'voz'|'formulario'),
//   createdAt
// }
// Ingreso: { id, amount, description, date, inputMethod, createdAt }

export const EXPENSE_TYPES = [
  { id: 'fijo', label: 'Gasto fijo' },
  { id: 'variable', label: 'Gasto variable' },
  { id: 'puntual', label: 'Compra puntual' },
];

export function defaultState() {
  const viviendaId = 'vivienda';
  const localId = 'local';

  const groups = [
    { id: viviendaId, name: 'Vivienda', color: '#2563eb' },
    { id: localId, name: 'Local/Negocio', color: '#d97706' },
  ];

  const subcategories = [
    { id: uuid(), groupId: viviendaId, name: 'Alquiler' },
    { id: uuid(), groupId: viviendaId, name: 'Expensas' },
    { id: uuid(), groupId: viviendaId, name: 'Luz' },
    { id: uuid(), groupId: viviendaId, name: 'Gas' },
    { id: uuid(), groupId: viviendaId, name: 'Internet' },
    { id: uuid(), groupId: viviendaId, name: 'Agua' },
    { id: uuid(), groupId: viviendaId, name: 'Otro' },

    { id: uuid(), groupId: localId, name: 'Alquiler local' },
    { id: uuid(), groupId: localId, name: 'Empleados' },
    { id: uuid(), groupId: localId, name: 'Insumos' },
    { id: uuid(), groupId: localId, name: 'Publicidad' },
    { id: uuid(), groupId: localId, name: 'Cuotas de equipamiento' },
    { id: uuid(), groupId: localId, name: 'Tarjeta' },
    { id: uuid(), groupId: localId, name: 'Otro' },
  ];

  return {
    version: 1,
    groups,
    subcategories,
    expenses: [],
    incomes: [],
    recurring: [], // gastos fijos recurrentes: { id, groupId, subcategoryId, description, amount, dayOfMonth }
    config: {
      fxRate: null, // cotización USD->ARS definida manualmente por el usuario
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
    date: todayISO(),
    type: 'puntual',
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
    description: '',
    date: todayISO(),
    inputMethod: 'formulario',
    createdAt: Date.now(),
    ...partial,
  };
}

export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}
