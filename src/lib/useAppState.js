import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { loadState, persistState, fetchServerState, pushServerState } from './storage';
import { defaultState } from './model';

// Migra estados guardados de versiones anteriores para que tengan las claves
// nuevas (config de metas, grupo de "Salidas/Ocio") sin perder datos.
function migrateState(saved) {
  if (!saved) return defaultState();
  const s = { ...saved };
  s.exchanges = Array.isArray(s.exchanges) ? s.exchanges : [];

  s.config = {
    fxRate: null, savingsGoal: null,
    extrasBudget: null, extrasGroupId: null,
    diaADiaBudget: null, diaADiaGroupId: null,
    ...s.config,
  };

  // Asegura un grupo para gastos extras/salidas y lo deja como default del
  // presupuesto si todavía no hay uno elegido.
  let extras = s.groups?.find((g) => /salida|ocio/i.test(g.name));
  if (!extras) {
    extras = { id: 'salidas', name: 'Salidas/Ocio', color: '#6D4B8F' };
    s.groups = [...(s.groups || []), extras];
    const subs = ['Comidas afuera', 'Delivery', 'Kiosko', 'Entretenimiento', 'Regalos', 'Otro'];
    s.subcategories = [
      ...(s.subcategories || []),
      ...subs.map((name) => ({ id: uuid(), groupId: extras.id, name })),
    ];
  }
  if (!s.config.extrasGroupId || !s.groups.some((g) => g.id === s.config.extrasGroupId)) {
    s.config.extrasGroupId = extras.id;
  }

  // Asegura que el grupo "Vivienda" siga existiendo.
  let vivienda = s.groups?.find((g) => /vivienda/i.test(g.name));
  if (!vivienda) {
    vivienda = { id: 'vivienda', name: 'Vivienda', color: '#1F5673' };
    s.groups = [...(s.groups || []), vivienda];
  }

  // Grupo "Día a día": gasto variable (súper, verdulería, ferretería,
  // psicólogo, etc), separado de Vivienda (fijo/inevitable, sin presupuesto)
  // y de Salidas/Ocio (discrecional). La primera vez que se crea, se mudan
  // ahí las subcategorías "Internet"/"Agua" que antes vivían en Vivienda
  // —junto con los gastos ya cargados que las usaban, para reclasificarlos
  // también— y el presupuesto que estaba puesto en Vivienda pasa a ser el
  // de esta categoría nueva.
  let diaADia = s.groups?.find((g) => /d[ií]a a d[ií]a/i.test(g.name));
  if (!diaADia) {
    diaADia = { id: 'diaadia', name: 'Día a día', color: '#8A6D3F' };
    s.groups = [...s.groups, diaADia];

    const movedNames = /^(internet|agua)$/i;
    const movedSubIds = new Set(
      (s.subcategories || [])
        .filter((sc) => sc.groupId === vivienda.id && movedNames.test(sc.name))
        .map((sc) => sc.id)
    );
    if (movedSubIds.size > 0) {
      s.subcategories = s.subcategories.map((sc) =>
        movedSubIds.has(sc.id) ? { ...sc, groupId: diaADia.id } : sc
      );
      s.expenses = (s.expenses || []).map((e) =>
        movedSubIds.has(e.subcategoryId) ? { ...e, groupId: diaADia.id } : e
      );
    }

    const newSubNames = ['Súper', 'Verdulería', 'Ferretería', 'Psicólogo', 'Otro'];
    const already = new Set(
      (s.subcategories || []).filter((sc) => sc.groupId === diaADia.id).map((sc) => sc.name)
    );
    s.subcategories = [
      ...s.subcategories,
      ...newSubNames
        .filter((name) => !already.has(name))
        .map((name) => ({ id: uuid(), groupId: diaADia.id, name })),
    ];

    if (s.config.viviendaBudget && !s.config.diaADiaBudget) {
      s.config.diaADiaBudget = s.config.viviendaBudget;
    }
  }
  delete s.config.viviendaBudget;
  delete s.config.viviendaGroupId;
  if (!s.config.diaADiaGroupId || !s.groups.some((g) => g.id === s.config.diaADiaGroupId)) {
    s.config.diaADiaGroupId = diaADia.id;
  }

  // "Otro" en Vivienda era en la práctica el cajón de sastre donde caía todo
  // el gasto variable (súper, verdulería, psicólogo...) al no tener
  // categoría propia. Si ese "Otro" tiene gastos cargados, es el histórico
  // viejo: se muda a Día a día con todo su historial. Se detecta por tener
  // gastos (no por existir nomás) para que sea idempotente — una vez mudado,
  // Vivienda queda con un "Otro" nuevo y vacío que ya no vuelve a moverse.
  const viviendaOtro = s.subcategories.find(
    (sc) => sc.groupId === vivienda.id && /^otro$/i.test(sc.name)
  );
  if (viviendaOtro && s.expenses.some((e) => e.subcategoryId === viviendaOtro.id)) {
    // Si Día a día ya tiene un "Otro" vacío (creado en una migración previa
    // que solo movió Internet/Agua), lo sacamos para no duplicar: el "Otro"
    // con historial pasa a ser el de acá.
    const emptyDiaADiaOtro = s.subcategories.find(
      (sc) => sc.groupId === diaADia.id && sc.id !== viviendaOtro.id && /^otro$/i.test(sc.name) &&
        !s.expenses.some((e) => e.subcategoryId === sc.id)
    );
    if (emptyDiaADiaOtro) {
      s.subcategories = s.subcategories.filter((sc) => sc.id !== emptyDiaADiaOtro.id);
    }
    s.subcategories = s.subcategories.map((sc) =>
      sc.id === viviendaOtro.id ? { ...sc, groupId: diaADia.id } : sc
    );
    s.expenses = s.expenses.map((e) =>
      e.subcategoryId === viviendaOtro.id ? { ...e, groupId: diaADia.id } : e
    );
    s.subcategories = [...s.subcategories, { id: uuid(), groupId: vivienda.id, name: 'Otro' }];
  }

  // Recolorea los grupos al rediseño "papel cálido" si todavía tienen los
  // colores viejos (azul/violeta tailwind por defecto).
  const RECOLOR = { '#2563eb': '#1F5673', '#7c3aed': '#6D4B8F', '#d97706': '#B0491F' };
  s.groups = (s.groups || []).map((g) =>
    RECOLOR[g.color] ? { ...g, color: RECOLOR[g.color] } : g
  );

  // Grupo "Local": gastos del local de Pablo, separados de los personales.
  // Un ingreso puede marcarse como reembolso de Local (groupId del ingreso
  // = id de este grupo) para descontarlo de lo gastado — ver
  // selectors.computeLocalBalance, que es acumulado, no mensual.
  if (!s.groups.some((g) => /^local$/i.test(g.name))) {
    s.groups = [...s.groups, { id: 'local', name: 'Local', color: '#3F6E63' }];
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

    addExchange(exchange) {
      setState((s) => ({ ...s, exchanges: [...(s.exchanges || []), exchange] }));
    },
    updateExchange(id, patch) {
      setState((s) => ({
        ...s,
        exchanges: (s.exchanges || []).map((x) => (x.id === id ? { ...x, ...patch } : x)),
      }));
    },
    deleteExchange(id) {
      setState((s) => ({ ...s, exchanges: (s.exchanges || []).filter((x) => x.id !== id) }));
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
    setDiaADiaBudget(amount) {
      setState((s) => ({ ...s, config: { ...s.config, diaADiaBudget: amount } }));
    },
    setDiaADiaGroupId(groupId) {
      setState((s) => ({ ...s, config: { ...s.config, diaADiaGroupId: groupId } }));
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
