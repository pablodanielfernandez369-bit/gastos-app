import { useMemo } from 'react';
import { computeMonthBudget, computeLocalBalance, computeTotals } from '../lib/selectors';
import { formatARS, formatDate, monthKey } from '../lib/format';

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

// Oculto en pantalla, visible solo al imprimir (ver la regla @media print
// en index.css). Una hoja por billetera, con los mismos movimientos que ya
// se ven al tocar cada una en la app — solo que en texto plano para papel,
// sin colores ni chips (ahorra tinta).
export default function PrintWallets({ state }) {
  const b = useMemo(() => computeMonthBudget(state), [state]);
  const prestamo = useMemo(() => computeLocalBalance(state), [state]);
  const allTime = useMemo(() => computeTotals(state, null, null), [state]);

  const currKey = monthKey(new Date().toISOString());
  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name || '';

  function monthExpenseRows(groupId) {
    return state.expenses
      .filter((e) => e.groupId === groupId && monthKey(e.date) === currKey)
      .slice()
      .sort((a, c) => (a.date < c.date ? -1 : 1))
      .map((e) => ({
        date: e.date,
        label: e.description || subName(e.subcategoryId) || '—',
        sub: subName(e.subcategoryId),
        amount: e.currency === 'USD' ? formatUsd(e.amountOriginal) : formatARS(e.amount),
      }));
  }

  const dolaresRows = useMemo(() => {
    const rows = [];
    for (const i of state.incomes) {
      if (i.currency === 'USD') rows.push({ date: i.date, label: i.description || 'Ingreso', tipo: 'Ingreso', amount: formatUsd(i.amountOriginal) });
    }
    for (const e of state.expenses) {
      if (e.currency === 'USD') rows.push({ date: e.date, label: e.description || 'Gasto', tipo: 'Gasto', amount: formatUsd(e.amountOriginal) });
    }
    for (const x of state.exchanges || []) {
      rows.push({ date: x.date, label: x.description || 'Compra de dólares', tipo: 'Compra', amount: formatUsd(x.usd) });
    }
    return rows.sort((a, c) => (a.date < c.date ? -1 : 1));
  }, [state]);

  return (
    <div className="print-only">
      <WalletSheet
        title="Vivienda"
        subtitle="Movimientos de este mes"
        total={b.vivienda ? formatARS(b.vivienda.spent) : formatARS(0)}
        rows={b.vivienda ? monthExpenseRows(b.vivienda.groupId) : []}
        columns={['Fecha', 'Descripción', 'Subcategoría', 'Monto']}
      />

      <WalletSheet
        title="Día a día"
        subtitle="Movimientos de este mes"
        total={b.diaADia ? formatARS(b.diaADia.spent) : formatARS(0)}
        rows={b.diaADia ? monthExpenseRows(b.diaADia.groupId) : []}
        columns={['Fecha', 'Descripción', 'Subcategoría', 'Monto']}
      />

      <WalletSheet
        title="Salidas / gastos extras"
        subtitle="Movimientos de este mes"
        total={b.extras ? formatARS(b.extras.spent) : formatARS(0)}
        rows={b.extras ? monthExpenseRows(b.extras.groupId) : []}
        columns={['Fecha', 'Descripción', 'Subcategoría', 'Monto']}
      />

      <WalletSheet
        title="Familia"
        subtitle="Movimientos de este mes"
        total={b.familia ? formatARS(b.familia.spent) : formatARS(0)}
        rows={b.familia ? monthExpenseRows(b.familia.groupId) : []}
        columns={['Fecha', 'Descripción', 'Subcategoría', 'Monto']}
      />

      <WalletSheet
        title="Dólares"
        subtitle="Todo el historial en esta moneda"
        total={formatUsd(allTime.savingsByCurrency.usd + (allTime.swaps?.usd || 0))}
        rows={dolaresRows.map((r) => ({ date: r.date, label: r.label, sub: r.tipo, amount: r.amount }))}
        columns={['Fecha', 'Descripción', 'Tipo', 'Monto']}
      />

      {prestamo && (
        <section className="print-page">
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

function WalletSheet({ title, subtitle, total, rows, columns }) {
  return (
    <section className="print-page">
      <h1>{title}</h1>
      <p className="print-sub">{subtitle} · Total: {total}</p>
      {rows.length === 0 ? (
        <p>Sin movimientos.</p>
      ) : (
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c} className={c === 'Monto' ? 'num' : ''}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{formatDate(r.date)}</td>
                <td>{r.label}</td>
                <td>{r.sub}</td>
                <td className="num">{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
