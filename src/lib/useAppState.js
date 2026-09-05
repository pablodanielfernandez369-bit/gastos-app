import { useEffect, useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { loadState, persistState } from './storage';
import { defaultState } from './model';

// Hook central: carga el estado guardado (o crea uno default), lo persiste
// en cada cambio, y expone las operaciones CRUD que usa toda la app.
export function useAppState() {
  const [state, setState] = useState(() => loadState() || defaultState());

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
