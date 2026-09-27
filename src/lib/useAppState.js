import { useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { loadState, persistState, fetchServerState, pushServerState } from './storage.js';
import { defaultState, FAMILIA_GROUP_ID, PRESTAMO_GROUP_ID, TARJETAS_GROUP_ID } from './model.js';

// Migra estados guardados de versiones anteriores para que tengan las claves
// nuevas (config de metas, grupo de "Salidas/Ocio") sin perder datos.
function migrateState(saved) {
  if (!saved) return defaultState();
  const s = { ...saved };
  s.exchanges = Array.isArray(s.exchanges) ? s.exchanges : [];
  s.dolarHistory = s.dolarHistory && typeof s.dolarHistory === 'object' ? s.dolarHistory : {};
  s.autoDeductions = Array.isArray(s.autoDeductions) ? s.autoDeductions : [];

  s.config = {
    fxRate: null, savingsGoal: null,
    extrasBudget: null, extrasGroupId: null,
    diaADiaBudget: null, diaADiaGroupId: null,
    viviendaBudget: null, familiaBudget: null, tarjetasBudget: null,
    ...s.config,
  };
  // Categorías propias del usuario que eligió mostrar como tarjeta en el
  // inicio (además de las fijas): { [groupId]: { budget: number|null } } —
  // la sola presencia de la clave dice "mostrar", el presupuesto es opcional
  // (mismo criterio que Vivienda/Familia/Tarjetas).
  s.config.customCards = s.config.customCards && typeof s.config.customCards === 'object' ? s.config.customCards : {};

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

  // Billetera "Préstamo" (antes "Local"): plata que se le presta a alguien
  // y se espera que devuelvan, en efectivo o condonada — "Local" (el
  // negocio de Pablo) es una persona más ahí adentro, no un caso aparte.
  // Se busca y crea SIEMPRE por id, nunca por nombre: el nombre cambió,
  // el grupo (y su historial) sigue siendo el mismo.
  let prestamo = s.groups?.find((g) => g.id === PRESTAMO_GROUP_ID);
  if (!prestamo) {
    prestamo = { id: PRESTAMO_GROUP_ID, name: 'Préstamo', color: '#3F6E63' };
    s.groups = [...s.groups, prestamo];
  } else if (prestamo.name !== 'Préstamo') {
    s.groups = s.groups.map((g) => (g.id === PRESTAMO_GROUP_ID ? { ...g, name: 'Préstamo' } : g));
  }
  s.debtSettlements = Array.isArray(s.debtSettlements) ? s.debtSettlements : [];
  // Lo cargado en Préstamo antes de que existiera el desglose por persona
  // no tenía personName — en la práctica era siempre el negocio ("Local"),
  // así que se le pone ese nombre para que no se pierda en "Sin nombre".
  s.expenses = s.expenses.map((e) =>
    e.groupId === PRESTAMO_GROUP_ID && !e.personName ? { ...e, personName: 'Local' } : e
  );
  s.incomes = s.incomes.map((i) =>
    i.groupId === PRESTAMO_GROUP_ID && !i.personName ? { ...i, personName: 'Local' } : i
  );

  // Grupo "Familia": plata que se le da a la familia sin esperar que la
  // devuelvan (ej. "ayuda a papás"), separada de Préstamo.
  let familia = s.groups?.find((g) => g.id === FAMILIA_GROUP_ID);
  if (!familia) {
    familia = { id: FAMILIA_GROUP_ID, name: 'Familia', color: '#8F4B5C' };
    s.groups = [...s.groups, familia];
    s.subcategories = [
      ...s.subcategories,
      { id: uuid(), groupId: familia.id, name: 'Ayuda a papás' },
      { id: uuid(), groupId: familia.id, name: 'Otro' },
    ];
  }
  // "Ayuda a papás" pudo haber quedado antes en otro grupo (ej. Día a día):
  // si tiene gastos cargados, se muda entera a Familia con su historial.
  // Idempotente (se detecta por tener gastos, no por existir nomás).
  const ayudaPapasVieja = s.subcategories.find(
    (sc) =>
      sc.groupId !== familia.id &&
      /^ayuda a pap[aá]s$/i.test(sc.name) &&
      s.expenses.some((e) => e.subcategoryId === sc.id)
  );
  if (ayudaPapasVieja) {
    const destino = s.subcategories.find((sc) => sc.groupId === familia.id && /^ayuda a pap[aá]s$/i.test(sc.name));
    if (destino) {
      s.expenses = s.expenses.map((e) =>
        e.subcategoryId === ayudaPapasVieja.id ? { ...e, groupId: familia.id, subcategoryId: destino.id } : e
      );
      s.subcategories = s.subcategories.filter((sc) => sc.id !== ayudaPapasVieja.id);
    }
  }

  // Grupo "Tarjetas": consumos con tarjeta, separados del resto.
  if (!s.groups?.some((g) => g.id === TARJETAS_GROUP_ID)) {
    const tarjetas = { id: TARJETAS_GROUP_ID, name: 'Tarjetas', color: '#55606E' };
    s.groups = [...s.groups, tarjetas];
    s.subcategories = [...s.subcategories, { id: uuid(), groupId: tarjetas.id, name: 'Otro' }];
  }

  return s;
}

// Hook central: arranca del caché local (render instantáneo), sincroniza con
// el servidor, persiste cada cambio en local + servidor, y expone el CRUD.
export function useAppState(walletId = 'main') {
  const [state, setState] = useState(() => migrateState(loadState(walletId)));
  const bootedRef = useRef(false); // ya terminó la sincronización inicial
  const pushPendingRef = useRef(false); // hay un cambio local sin subir
  const syncedAtRef = useRef(null); // updated_at del servidor que ya vimos

  function adoptServer(data, updatedAt) {
    const migrated = migrateState(data);
    syncedAtRef.current = updatedAt;
    setState(migrated);
    persistState(migrated, walletId);
  }

  // Sincronización inicial: si el servidor tiene datos, los adoptamos; si está
  // vacío, subimos lo que haya en local (primera migración a la base, o una
  // billetera recién creada que arranca sin nada).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, updatedAt } = await fetchServerState(walletId);
        if (cancelled) return;
        const serverHasData =
          data && data.groups && (data.expenses?.length || data.incomes?.length || data.groups?.length > 2);
        if (serverHasData) {
          adoptServer(data, updatedAt);
        } else {
          const local = migrateState(loadState(walletId));
          const { updatedAt: newAt } = await pushServerState(local, walletId);
          syncedAtRef.current = newAt;
          setState(local);
        }
      } catch (e) {
        console.warn('Sincronización inicial falló, sigo con el caché local:', e.message);
      } finally {
        bootedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId]);

  // Cada cambio: guardar en local ya, y subir al servidor con un pequeño debounce.
  useEffect(() => {
    persistState(state, walletId);
    if (!bootedRef.current) return;
    pushPendingRef.current = true;
    const t = setTimeout(async () => {
      try {
        const { updatedAt } = await pushServerState(state, walletId);
        syncedAtRef.current = updatedAt;
      } catch (e) {
        console.warn('No se pudo subir el estado al servidor:', e.message);
      } finally {
        pushPendingRef.current = false;
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, walletId]);

  // Traer cambios del servidor al volver a la app o cada 20s (útil si
  // cargaste un gasto desde otro dispositivo).
  useEffect(() => {
    async function refresh() {
      if (!bootedRef.current || pushPendingRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const { data, updatedAt } = await fetchServerState(walletId);
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

    // Descuento de USD ligado a un gasto puntual (checkbox "Pagué esto
    // vendiendo dólares" en el formulario): a diferencia del cron nocturno
    // (que mira el mes completo y puede agarrar datos a mitad de carga), esto
    // es explícito por Pablo y usa la cotización del momento exacto en que
    // carga el gasto.
    addAutoDeduction(deduction) {
      setState((s) => ({ ...s, autoDeductions: [...(s.autoDeductions || []), deduction] }));
    },
    deleteAutoDeduction(id) {
      setState((s) => ({
        ...s,
        autoDeductions: (s.autoDeductions || []).filter((d) => d.id !== id),
      }));
    },

    addDebtSettlement(settlement) {
      setState((s) => ({ ...s, debtSettlements: [...(s.debtSettlements || []), settlement] }));
    },
    updateDebtSettlement(id, patch) {
      setState((s) => ({
        ...s,
        debtSettlements: (s.debtSettlements || []).map((d) => (d.id === id ? { ...d, ...patch } : d)),
      }));
    },
    deleteDebtSettlement(id) {
      setState((s) => ({ ...s, debtSettlements: (s.debtSettlements || []).filter((d) => d.id !== id) }));
    },

    addGroup(name) {
      const id = uuid();
      setState((s) => ({
        ...s,
        groups: [...s.groups, { id, name, color: randomColor() }],
      }));
      return id;
    },

    // Borra una categoría principal creada por el usuario (ej "Perro" que
    // agregó Pablo para probar). NUNCA las fijas del sistema (Vivienda, Día
    // a día, Salidas/Ocio, Familia, Tarjetas, Préstamo) — esas están cableadas
    // en selectors/config y borrarlas rompería las billeteras del dashboard.
    // Los gastos que tenía esa categoría NO se borran, quedan sin categorizar
    // (mismo criterio que ya usa deleteSubcategory).
    deleteGroup(id) {
      setState((s) => {
        const protectedIds = new Set([
          'vivienda',
          PRESTAMO_GROUP_ID,
          FAMILIA_GROUP_ID,
          TARJETAS_GROUP_ID,
          s.config?.extrasGroupId,
          s.config?.diaADiaGroupId,
        ]);
        if (protectedIds.has(id)) return s;
        const subIds = new Set(s.subcategories.filter((sc) => sc.groupId === id).map((sc) => sc.id));
        const customCards = { ...(s.config?.customCards || {}) };
        delete customCards[id];
        return {
          ...s,
          groups: s.groups.filter((g) => g.id !== id),
          subcategories: s.subcategories.filter((sc) => sc.groupId !== id),
          expenses: s.expenses.map((e) =>
            e.groupId === id ? { ...e, groupId: null, subcategoryId: null } : subIds.has(e.subcategoryId) ? { ...e, subcategoryId: null } : e
          ),
          config: { ...s.config, customCards },
        };
      });
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
    setViviendaBudget(amount) {
      setState((s) => ({ ...s, config: { ...s.config, viviendaBudget: amount } }));
    },
    setFamiliaBudget(amount) {
      setState((s) => ({ ...s, config: { ...s.config, familiaBudget: amount } }));
    },
    setTarjetasBudget(amount) {
      setState((s) => ({ ...s, config: { ...s.config, tarjetasBudget: amount } }));
    },

    // Categorías propias como tarjeta del inicio (ver migración arriba).
    // enabled=true la agrega (presupuesto null, "sin presupuesto" hasta que
    // se configure); false la saca de la vista de inicio sin borrar la
    // categoría ni sus gastos.
    setCustomCardEnabled(groupId, enabled) {
      setState((s) => {
        const customCards = { ...(s.config.customCards || {}) };
        if (enabled) customCards[groupId] = customCards[groupId] || { budget: null };
        else delete customCards[groupId];
        return { ...s, config: { ...s.config, customCards } };
      });
    },
    setCustomCardBudget(groupId, budget) {
      setState((s) => ({
        ...s,
        config: {
          ...s.config,
          customCards: {
            ...(s.config.customCards || {}),
            [groupId]: { ...(s.config.customCards?.[groupId] || {}), budget },
          },
        },
      }));
    },

    addRecurring(recurring) {
      setState((s) => ({ ...s, recurring: [...s.recurring, recurring] }));
    },
    deleteRecurring(id) {
      setState((s) => ({ ...s, recurring: s.recurring.filter((r) => r.id !== id) }));
    },
    // "Ya lo cargué": para cuando el gasto ya se cargó por el flujo normal
    // (sin pasar por "Cargar ahora"), así no queda pidiéndolo de nuevo este
    // mes. El mes que viene vuelve a aparecer solo, normalmente.
    dismissRecurringForMonth(id, monthKey) {
      setState((s) => ({
        ...s,
        recurring: s.recurring.map((r) =>
          r.id === id ? { ...r, dismissedMonths: [...(r.dismissedMonths || []), monthKey] } : r
        ),
      }));
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
