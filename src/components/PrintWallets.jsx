import { useMemo } from 'react';
import { computeMonthBudget, computeLocalBalance, computeTotals } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

// Agrupa las filas por categoría (ej. "Súper", "Verdulería", "Nafta mel")
// en vez de por fecha: cada subcategoría real (subcategoryId) sale junta,
// con su propio subtotal — nunca se mezclan dos subcategorías distintas
// bajo un mismo título. Se ordena por lo que más se gastó primero.
function groupRows(rows) {
  const groups = {};
  for (const r of rows) {
    const key = r.group || 'Sin categorizar';
    if (!groups[key]) groups[key] = { name: key, items: [], total: 0 };
    groups[key].items.push(r);
    groups[key].total += r.rawAmount;
  }
  return Object.values(groups)
    .map((g) => ({ ...g, items: g.items.slice().sort((a, b) => (a.date < b.date ? -1 : 1)) }))
    .sort((a, b) => b.total - a.total);
}

// Oculto en pantalla, visible solo al imprimir (ver la regla @media print
// en index.css). Una billetera debajo de la otra (sin salto de hoja
// forzado), con los movimientos agrupados por categoría — solo texto
// plano para papel, sin colores ni chips (ahorra tinta).
export default function PrintWallets({ state }) {
  const b = useMemo(() => computeMonthBudget(state), [state]);
  const prestamo = useMemo(() => computeLocalBalance(state), [state]);
  const allTime = useMemo(() => computeTotals(state, null, null), [state]);

  const currKey = monthKey(new Date().toISOString());
  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name || 'Sin categorizar';

  function monthExpenseRows(groupId) {
    return state.expenses
      .filter((e) => e.groupId === groupId && monthKey(e.date) === currKey)
      .map((e) => {
        const rawAmount = e.currency === 'USD' ? e.amountOriginal : e.amount;
        return {
          date: e.date,
          label: e.description || '—', // la categoría ya es el título del grupo, no hace falta repetirla
          group: subName(e.subcategoryId),
          rawAmount,
          amount: e.currency === 'USD' ? formatUsd(rawAmount) : formatARS(rawAmount),
        };
      });
  }

  const dolaresRows = useMemo(() => {
    const rows = [];
    for (const i of state.incomes) {
      if (i.currency === 'USD') rows.push({ date: i.date, label: i.description || 'Ingreso', group: 'Ingreso', rawAmount: i.amountOriginal, amount: formatUsd(i.amountOriginal) });
    }
    for (const e of state.expenses) {
      if (e.currency === 'USD') rows.push({ date: e.date, label: e.description || 'Gasto', group: 'Gasto', rawAmount: e.amountOriginal, amount: formatUsd(e.amountOriginal) });
    }
    for (const x of state.exchanges || []) {
      rows.push({ date: x.date, label: x.description || 'Compra de dólares', group: 'Compra', rawAmount: x.usd, amount: formatUsd(x.usd) });
    }
    return rows;
  }, [state]);

  return (
    <div className="print-only">
      <WalletSheet
        title="Vivienda"
        subtitle="Movimientos de este mes, agrupados por categoría"
        total={b.vivienda ? formatARS(b.vivienda.spent) : formatARS(0)}
        rows={b.vivienda ? monthExpenseRows(b.vivienda.groupId) : []}
      />
      <WalletSheet
        title="Día a día"
        subtitle="Movimientos de este mes, agrupados por categoría"
        total={b.diaADia ? formatARS(b.diaADia.spent) : formatARS(0)}
        rows={b.diaADia ? monthExpenseRows(b.diaADia.groupId) : []}
      />
      <WalletSheet
        title="Salidas / gastos extras"
        subtitle="Movimientos de este mes, agrupados por categoría"
        total={b.extras ? formatARS(b.extras.spent) : formatARS(0)}
        rows={b.extras ? monthExpenseRows(b.extras.groupId) : []}
      />
      <WalletSheet
        title="Familia"
        subtitle="Movimientos de este mes, agrupados por categoría"
        total={b.familia ? formatARS(b.familia.spent) : formatARS(0)}
        rows={b.familia ? monthExpenseRows(b.familia.groupId) : []}
      />
      <WalletSheet
        title="Dólares"
        subtitle="Todo el historial en esta moneda, agrupado por tipo"
        total={formatUsd(allTime.savingsByCurrency.usd + (allTime.swaps?.usd || 0))}
        rows={dolaresRows}
      />

      {prestamo && (
        <section className="print-section">
          <h1>Préstamo</h1>
          <p className="print-sub">Te deben en total: {formatARS(Math.max(0, prestamo.balance))}</p>
          {prestamo.people.length === 0 ? (
            <p>Sin préstamos todavía.</p>
          ) : (
            prestamo.people.map((p) => {
              const rows = [
                ...state.expenses
                  .filter((e) => e.groupId === prestamo.groupId && (e.personName || 'Sin nombre') === p.personName)
                  .map((e) => ({ date: e.date, label: e.description || 'Préstamo', amount: `−${formatARS(e.amount)}` })),
                ...state.incomes
                  .filter((i) => i.groupId === prestamo.groupId && (i.personName || 'Sin nombre') === p.personName)
                  .map((i) => ({ date: i.date, label: i.description || 'Reembolso', amount: `+${formatARS(i.amount)}` })),
                ...(state.debtSettlements || [])
                  .filter((s) => (s.personName || 'Sin nombre') === p.personName)
                  .map((s) => ({ date: s.date, label: s.description ? `Saldado de otra forma · ${s.description}` : 'Saldado de otra forma', amount: `+${formatARS(s.amount)}` })),
              ].sort((a, c) => (a.date < c.date ? -1 : 1));
              return (
                <div key={p.personName} className="print-person">
                  <h2>{p.personName} — {p.balance > 0 ? `te debe ${formatARS(p.balance)}` : 'al día'}</h2>
                  <table>
                    <thead>
                      <tr><th>Fecha</th><th>Descripción</th><th className="num">Monto</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}><td>{formatDate(r.date)}</td><td>{r.label}</td><td className="num">{r.amount}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

function WalletSheet({ title, subtitle, total, rows }) {
  const groups = groupRows(rows);
  return (
    <section className="print-section">
      <h1>{title}</h1>
      <p className="print-sub">{subtitle} · Total: {total}</p>
      {groups.length === 0 ? (
        <p>Sin movimientos.</p>
      ) : (
        groups.map((g) => (
          <div key={g.name} className="print-group">
            <h2>{g.name} <span className="num">— {formatARS(g.total)}</span></h2>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Descripción</th><th className="num">Monto</th></tr>
              </thead>
              <tbody>
                {g.items.map((r, i) => (
                  <tr key={i}>
                    <td>{formatDate(r.date)}</td>
                    <td>{r.label}</td>
                    <td className="num">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}
