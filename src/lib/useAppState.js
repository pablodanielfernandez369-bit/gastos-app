import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { loadState, persistState } from './storage';
import { defaultState } from './model';

// Migra estados guardados de versiones anteriores para que tengan las claves
// nuevas (config de metas, grupo de "Salidas/Ocio") sin perder datos.
function migrateState(saved) {
  if (!saved) return defaultState();
  const s = { ...saved };

  s.config = { fxRate: null, savingsGoal: null, extrasBudget: null, extrasGroupId: null, ...s.config };

  // Asegura un grupo para gastos extras/salidas y lo deja como default del
  // presupuesto si todavía no hay uno elegido.
  let extras = s.groups?.find((g) => /salida|ocio/i.test(g.name));
  if (!extras) {
    extras = { id: 'salidas', name: 'Salidas/Ocio', color: '#7c3aed' };
    s.groups = [...(s.groups || []), extras];
    const subs = ['Comidas afuera', 'Delivery', 'Entretenimiento', 'Regalos', 'Otro'];
    s.subcategories = [
      ...(s.subcategories || []),
      ...subs.map((name) => ({ id: uuid(), groupId: extras.id, name })),
    ];
  }
  if (!s.config.extrasGroupId || !s.groups.some((g) => g.id === s.config.extrasGroupId)) {
    s.config.extrasGroupId = extras.id;
  }

  // El grupo "Local/Negocio" ya no se usa: se saca si no tiene gastos cargados
  // (si tuviera, se deja para no perder historial).
  const local = s.groups.find((g) => /local|negocio/i.test(g.name));
  if (local && !s.expenses.some((e) => e.groupId === local.id)) {
    s.groups = s.groups.filter((g) => g.id !== local.id);
    s.subcategories = (s.subcategories || []).filter((sc) => sc.groupId !== local.id);
    s.recurring = (s.recurring || []).filter((r) => r.groupId !== local.id);
  }

  return s;
}

// Hook central: carga el estado guardado (o crea uno default), lo persiste
// en cada cambio, y expone las operaciones CRUD que usa toda la app.
export function useAppState() {
  const [state, setState] = useState(() => migrateState(loadState()));

  useEffect(() => {
    persistState(state);
  }, [state]);

  const actions = useMemo(() => ({
    addExpense(expense) {
      setState((s) => ({ ...s, expenses: [...s.expenses, expense] }));
    },
    updateExpense(id, patch) {
      setState((s) => ({
        ...s,
        expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
    },
    deleteExpense(id) {
      setState((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== id) }));
    },

    addIncome(income) {
      setState((s) => ({ ...s, incomes: [...s.incomes, income] }));
    },
    updateIncome(id, patch) {
      setState((s) => ({
        ...s,
        incomes: s.incomes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      }));
    },
    deleteIncome(id) {
      setState((s) => ({ ...s, incomes: s.incomes.filter((i) => i.id !== id) }));
    },

    addGroup(name) {
      const id = uuid();
      setState((s) => ({
        ...s,
        groups: [...s.groups, { id, name, color: randomColor() }],
      }));
      return id;
    },

    addSubcategory(groupId, name) {
      const id = uuid();
      setState((s) => ({
        ...s,
        subcategories: [...s.subcategories, { id, groupId, name }],
      }));
      return id;
    },
    renameSubcategory(id, name) {
      setState((s) => ({
        ...s,
        subcategories: s.subcategories.map((sc) => (sc.id === id ? { ...sc, name } : sc)),
      }));
    },
    deleteSubcategory(id) {
      setState((s) => ({
        ...s,
        subcategories: s.subcategories.filter((sc) => sc.id !== id),
        expenses: s.expenses.map((e) => (e.subcategoryId === id ? { ...e, subcategoryId: null } : e)),
      }));
    },

    setFxRate(rate) {
      setState((s) => ({ ...s, config: { ...s.config, fxRate: rate } }));
    },

    setSavingsGoal(amount) {
      setState((s) => ({ ...s, config: { ...s.config, savingsGoal: amount } }));
    },
    setExtrasBudget(amount) {
      setState((s) => ({ ...s, config: { ...s.config, extrasBudget: amount } }));
    },
    setExtrasGroupId(groupId) {
      setState((s) => ({ ...s, config: { ...s.config, extrasGroupId: groupId } }));
    },

    addRecurring(recurring) {
      setState((s) => ({ ...s, recurring: [...s.recurring, recurring] }));
    },
    deleteRecurring(id) {
      setState((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) }));
    },

    replaceState(newState) {
      setState(newState);
    },
  }), []);

  return [state, actions];
}

function randomColor() {
  const palette = ['#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c', '#0284c7'];
  return palette[Math.floor(Math.random() * palette.length)];
}
