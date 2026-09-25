import { v4 as uuid } from 'uuid';

// "Dólares" no es un grupo real (es transversal a toda la moneda, no una
// categoría de gasto), así que no tiene un color propio en los grupos —
// se fija acá para que quede igual en Billeteras, Movimientos y Reportes.
export const USD_COLOR = '#B08A2E';

// Ids fijos de los grupos que selectors/migraciones necesitan encontrar
// siempre por id (nunca por nombre, que puede cambiar — ej. "Local" pasó a
// llamarse "Préstamo" pero sigue siendo el mismo grupo con este id).
export const PRESTAMO_GROUP_ID = 'local';
export const FAMILIA_GROUP_ID = 'familia';
export const TARJETAS_GROUP_ID = 'tarjetas';

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
//   id, amount, description, date, inputMethod, createdAt, personName,
//   groupId — normalmente null (ingreso personal); si se marca como
//   reembolso de Préstamo, se le pone el id de ese grupo y se descuenta
//   de lo gastado ahí (ver selectors.computeLocalBalance)
// }
// Condonación de deuda (Préstamo): { id, personName, amount, description,
//   date, createdAt } — cuando te "pagan" un préstamo sin plata de por
//   medio (un trabajo, un favor). Solo ajusta lo que esa persona te debe,
//   nunca cuenta como ingreso ni mueve el disponible.

export function defaultState() {
  const viviendaId = 'vivienda';
  const salidasId = 'salidas';
  const diaADiaId = 'diaadia';
  const localId = PRESTAMO_GROUP_ID;
  const familiaId = FAMILIA_GROUP_ID;
  const tarjetasId = TARJETAS_GROUP_ID;

  const groups = [
    { id: viviendaId, name: 'Vivienda', color: '#1F5673' },
    { id: salidasId, name: 'Salidas/Ocio', color: '#6D4B8F' },
    { id: diaADiaId, name: 'Día a día', color: '#8A6D3F' },
    { id: familiaId, name: 'Familia', color: '#8F4B5C' },
    { id: tarjetasId, name: 'Tarjetas', color: '#55606E' },
    { id: localId, name: 'Préstamo', color: '#3F6E63' },
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

    // Familia: plata que se da (no se espera de vuelta), separada de
    // Préstamo (que sí se espera reponer).
    { id: uuid(), groupId: familiaId, name: 'Ayuda a papás' },
    { id: uuid(), groupId: familiaId, name: 'Otro' },

    // Tarjetas: consumos con tarjeta, separados del resto para verlos
    // aparte (y presupuestarlos aparte, si hace falta).
    { id: uuid(), groupId: tarjetasId, name: 'Otro' },
  ];

  return {
    version: 1,
    groups,
    subcategories,
    expenses: [],
    incomes: [],
    exchanges: [], // compras de USD con pesos: { id, date, usd, rate, ars, description }
    recurring: [], // gastos fijos recurrentes: { id, groupId, subcategoryId, description, amount, dayOfMonth }
    debtSettlements: [], // condonaciones de Préstamo (ver comentario arriba)
    dolarHistory: {}, // cotización blue guardada por día, { 'YYYY-MM-DD': promedio } — la registra sola el cron del servidor, un valor por día
    autoDeductions: [], // descuentos automáticos de USD por gastar de más (ver server.js /api/auto-deduct-cron): { id, date, ars, usd, rate, createdAt }
    config: {
      fxRate: null, // última cotización USD->ARS usada al cargar un gasto en USD
      fxRateManual: null, // cotización que el usuario fija a mano (pisa al blue)
      savingsGoal: null, // meta de ahorro mensual en ARS
      extrasBudget: null, // presupuesto mensual para gastos extras/salidas en ARS
      extrasGroupId: salidasId, // qué grupo cuenta como "extras" para el presupuesto
      diaADiaBudget: null, // presupuesto mensual para gastos variables del día a día en ARS
      diaADiaGroupId: diaADiaId, // qué grupo cuenta como "día a día" para el presupuesto
      viviendaBudget: null, // presupuesto mensual de Vivienda en ARS (grupo fijo, sin selector)
      familiaBudget: null, // presupuesto mensual de Familia en ARS (grupo fijo, sin selector)
      tarjetasBudget: null, // presupuesto mensual de Tarjetas en ARS (grupo fijo, sin selector)
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
    dismissedMonths: [], // meses ('YYYY-MM') marcados "ya lo cargué" sin pasar por "Cargar ahora"
    ...partial,
  };
}

// Compra o venta de dólares. `kind: 'compra'` (default, plata de pesos a
// dólares) o `kind: 'venta'` (al revés: se venden dólares y entran pesos —
// ej. "vendí USD para cubrir un gasto"). `usd`/`ars` son siempre montos
// positivos; el signo con que cuentan en el pool de USD lo decide `kind`
// (ver selectors.exchangeTotals). Ninguna de las dos toca el "disponible"
// en pesos (comparación directa ingresos-gastos del mes) — son
// conversiones entre pools, no ingreso ni gasto nuevo.
export function newExchange(partial) {
  return {
    id: uuid(),
    date: todayISO(),
    kind: 'compra',
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
    personName: null, // para saber, en un reembolso de Préstamo, quién repuso
    date: todayISO(),
    inputMethod: 'formulario',
    groupId: null,
    createdAt: Date.now(),
    ...partial,
  };
}

// Condonar un préstamo sin que entre plata (te lo "pagaron" con un trabajo,
// un favor, etc.): baja lo que esa persona te debe pero no toca el
// disponible ni cuenta como ingreso, a diferencia de un reembolso real.
export function newDebtSettlement(partial) {
  return {
    id: uuid(),
    personName: '',
    amount: 0,
    description: '',
    date: todayISO(),
    createdAt: Date.now(),
    ...partial,
  };
}

// "Hoy" siempre en hora de Argentina, no importa la zona del dispositivo:
// así un gasto cargado a la noche no salta al día siguiente.
export function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}
