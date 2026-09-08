import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { loadState, persistState, fetchServerState, pushServerState } from './storage';
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
    extras = { id: 'salidas', name: 'Salidas/Ocio', color: '#6D4B8F' };
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

  // Recolorea los grupos al rediseño "papel cálido" si todavía tienen los
  // colores viejos (azul/violeta tailwind por defecto).
  const RECOLOR = { '#2563eb': '#1F5673', '#7c3aed': '#6D4B8F', '#d97706': '#B0491F' };
  s.groups = (s.groups || []).map((g) =>
    RECOLOR[g.color] ? { ...g, color: RECOLOR[g.color] } : g
  );

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

// Hook central: arranca del caché local (render instantáneo), sincroniza con
// el servidor, persiste cada cambio en local + servidor, y expone el CRUD.
export function useAppState() {
  const [state, setState] = useState(() => migrateState(loadState()));
  const bootedRef = useRef(false); // ya terminó la sincronización inicial
  const pushPendingRef = useRef(false); // hay un cambio local sin subir
  const syncedAtRef = useRef(null); // updated_at del servidor que ya vimos

  function adoptServer(data, updatedAt) {
    const migrated = migrateState(data);
    syncedAtRef.current = updatedAt;
    setState(migrated);
    persistState(migrated);
  }

  // Sincronización inicial: si el servidor tiene datos, los adoptamos; si está
  // vacío, subimos lo que haya en local (primera migración a la base).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, updatedAt } = await fetchServerState();
        if (cancelled) return;
        const serverHasData =
          data && data.groups && (data.expenses?.length || data.incomes?.length || data.groups?.length > 2);
        if (serverHasData) {
          adoptServer(data, updatedAt);
        } else {
          const local = migrateState(loadState());
          const { updatedAt: newAt } = await pushServerState(local);
          syncedAtRef.current = newAt;
        }
      } catch (e) {
        console.warn('Sincronización inicial falló, sigo con el caché local:', e.message);
      } finally {
        bootedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cada cambio: guardar en local ya, y subir al servidor con un pequeño debounce.
  useEffect(() => {
    persistState(state);
    if (!bootedRef.current) return;
    pushPendingRef.current = true;
    const t = setTimeout(async () => {
      try {
        const { updatedAt } = await pushServerState(state);
        syncedAtRef.current = updatedAt;
      } catch (e) {
        console.warn('No se pudo subir el estado al servidor:', e.message);
      } finally {
        pushPendingRef.current = false;
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [state]);

  // Traer cambios del servidor al volver a la app o cada 20s (útil cuando
  // cargás un gasto por Telegram, o desde otro dispositivo).
  useEffect(() => {
    async function refresh() {
      if (!bootedRef.current || pushPendingRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { data, updatedAt } = await fetchServerState();
        if (data && updatedAt && updatedAt !== syncedAtRef.current) {
          adoptServer(data, updatedAt);
        }
      } catch { /* offline: ignorar */ }
    }
    const iv = setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(iv); window.removeEventListener('focus', refresh); };
  }, []);

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
    setFxRateManual(rate) {
      setState((s) => ({ ...s, config: { ...s.config, fxRateManual: rate } }));
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
  const palette = ['#0F766E', '#6D4B8F', '#B0491F', '#5A7D2A', '#8A7A5C', '#1F5673'];
  return palette[Math.floor(Math.random() * palette.length)];
}
