import { useMemo } from 'react';
import { normalizePersonKey } from '../lib/selectors';
import { formatARS, formatMonthLabel, monthKey } from '../lib/format';
import { PRESTAMO_GROUP_ID } from '../lib/model';

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

// "Subió" = verde, "bajó" = rojo (al revés del semáforo habitual): así lo
// pidió Pablo para esta tabla puntual.
function delta(curr, prev) {
  if (prev === 0 && curr === 0) return { kind: 'flat' };
  if (prev === 0) return { kind: 'new' };
  const diff = curr - prev;
  const pct = (diff / prev) * 100;
  if (Math.abs(pct) < 1) return { kind: 'flat' };
  return { kind: diff > 0 ? 'up' : 'down', pct: Math.abs(pct), diff: Math.abs(diff) };
}

function CompareRow({ name, curr, prev, fmt }) {
  const d = delta(curr, prev);
  const dotClass = d.kind === 'up' ? 'cmp-up' : d.kind === 'down' ? 'cmp-down' : 'cmp-flat';
  return (
    <div className="cmp-row">
      <span className={`cmp-dot ${dotClass}`} />
      <span className="cmp-name">{name}</span>
      <span className="cmp-right">
        <span className="cmp-amt">{fmt(curr)}</span>
        {d.kind === 'new' && <span className="cmp-delta cmp-flat">(nuevo)</span>}
        {d.kind === 'flat' && <span className="cmp-delta cmp-flat">(sin cambios)</span>}
        {(d.kind === 'up' || d.kind === 'down') && (
          <span className={`cmp-delta ${d.kind === 'up' ? 'cmp-up' : 'cmp-down'}`}>
            ({d.kind === 'up' ? '▲' : '▼'} {d.pct.toFixed(1)}% · {d.kind === 'up' ? '+' : '−'}{fmt(d.diff)})
          </span>
        )}
      </span>
    </div>
  );
}

function CompareSheet({ title, currLabel, prevLabel, currTotal, prevTotal, rows, fmt }) {
  return (
    <section className="cmp-section">
      <h1>{title}</h1>
      <p className="cmp-sub">{currLabel} vs {prevLabel}</p>
      <div className="cmp-total">
        <span className="cmp-amt">{fmt(currTotal)}</span> este mes
        {(() => {
          const d = delta(currTotal, prevTotal);
          if (d.kind === 'new') return <span className="cmp-delta cmp-flat"> · (nuevo)</span>;
          if (d.kind === 'flat') return <span className="cmp-delta cmp-flat"> · (sin cambios)</span>;
          return (
            <span className={`cmp-delta ${d.kind === 'up' ? 'cmp-up' : 'cmp-down'}`}>
              {' '}· ({d.kind === 'up' ? '▲' : '▼'} {d.pct.toFixed(1)}% · {d.kind === 'up' ? '+' : '−'}{fmt(d.diff)} vs {prevLabel})
            </span>
          );
        })()}
      </div>
      {rows.length === 0 ? (
        <p>Sin movimientos en ninguno de los dos meses.</p>
      ) : (
        rows.map((r) => <CompareRow key={r.name} name={r.name} curr={r.curr} prev={r.prev} fmt={fmt} />)
      )}
    </section>
  );
}

// Oculto salvo al imprimir (botón "Imprimir tabla comparativa" en
// Ajustes). Una hoja por billetera: el total del mes vs el anterior, y
// abajo cada categoría propia con la misma comparación — lo que subió en
// verde, lo que bajó en rojo. Préstamo compara por persona cuánto se
// prestó cada mes (no la deuda acumulada); Dólares compara por tipo de
// movimiento (ingreso/gasto/compra).
export default function PrintComparison({ state }) {
  const { currKey, prevKey, currLabel, prevLabel } = useMemo(() => {
    const now = new Date();
    const currKey = monthKey(now.toISOString());
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevKey = monthKey(prevDate.toISOString());
    return {
      currKey,
      prevKey,
      currLabel: formatMonthLabel(currKey + '-01'),
      prevLabel: formatMonthLabel(prevKey + '-01'),
    };
  }, []);

  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name || 'Sin categorizar';

  function byExpenseSubcategory(groupId) {
    const sums = {};
    for (const e of state.expenses) {
      if (e.groupId !== groupId) continue;
      const mk = monthKey(e.date);
      if (mk !== currKey && mk !== prevKey) continue;
      const name = subName(e.subcategoryId);
      if (!sums[name]) sums[name] = { name, curr: 0, prev: 0 };
      sums[name][mk === currKey ? 'curr' : 'prev'] += e.amount;
    }
    return Object.values(sums).sort((a, b) => b.curr - a.curr);
  }

  function walletTotals(rows) {
    return rows.reduce((acc, r) => ({ curr: acc.curr + r.curr, prev: acc.prev + r.prev }), { curr: 0, prev: 0 });
  }

  const wallets = useMemo(() => {
    const groupSections = state.groups
      .filter((g) => g.id !== PRESTAMO_GROUP_ID)
      .map((g) => {
        const rows = byExpenseSubcategory(g.id);
        const t = walletTotals(rows);
        return { key: g.id, title: g.name, rows, currTotal: t.curr, prevTotal: t.prev };
      })
      .filter((s) => s.rows.length > 0);

    // Dólares: no tiene subcategorías (es transversal a la moneda), así
    // que se agrupa por tipo de movimiento en vez de por categoría.
    const dolaresSums = { Ingreso: { name: 'Ingreso', curr: 0, prev: 0 }, Gasto: { name: 'Gasto', curr: 0, prev: 0 }, Compra: { name: 'Compra de dólares', curr: 0, prev: 0 } };
    for (const i of state.incomes) {
      if (i.currency !== 'USD') continue;
      const mk = monthKey(i.date);
      if (mk !== currKey && mk !== prevKey) continue;
      dolaresSums.Ingreso[mk === currKey ? 'curr' : 'prev'] += i.amountOriginal || 0;
    }
    for (const e of state.expenses) {
      if (e.currency !== 'USD') continue;
      const mk = monthKey(e.date);
      if (mk !== currKey && mk !== prevKey) continue;
      dolaresSums.Gasto[mk === currKey ? 'curr' : 'prev'] += e.amountOriginal || 0;
    }
    for (const x of state.exchanges || []) {
      const mk = monthKey(x.date);
      if (mk !== currKey && mk !== prevKey) continue;
      dolaresSums.Compra[mk === currKey ? 'curr' : 'prev'] += x.usd || 0;
    }
    const dolaresRows = Object.values(dolaresSums).filter((r) => r.curr > 0 || r.prev > 0).sort((a, b) => b.curr - a.curr);
    const dolaresNet = {
      curr: dolaresSums.Ingreso.curr + dolaresSums.Compra.curr - dolaresSums.Gasto.curr,
      prev: dolaresSums.Ingreso.prev + dolaresSums.Compra.prev - dolaresSums.Gasto.prev,
    };

    // Préstamo: por persona, solo lo prestado ese mes (no la deuda
    // acumulada ni los reembolsos) — "cuánto le presté este mes vs el
    // mes pasado", que es lo que importa acá.
    const prestamoSums = {};
    for (const e of state.expenses) {
      if (e.groupId !== PRESTAMO_GROUP_ID) continue;
      const mk = monthKey(e.date);
      if (mk !== currKey && mk !== prevKey) continue;
      const raw = (e.personName || 'Sin nombre').trim() || 'Sin nombre';
      const key = normalizePersonKey(raw);
      if (!prestamoSums[key]) prestamoSums[key] = { name: raw, curr: 0, prev: 0 };
      prestamoSums[key][mk === currKey ? 'curr' : 'prev'] += e.amount;
    }
    const prestamoRows = Object.values(prestamoSums).sort((a, b) => b.curr - a.curr);
    const prestamoTotals = walletTotals(prestamoRows);

    return { groupSections, dolaresRows, dolaresNet, prestamoRows, prestamoTotals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currKey, prevKey]);

  return (
    <div className="print-only print-comparison">
      {wallets.groupSections.map((s) => (
        <CompareSheet
          key={s.key}
          title={s.title}
          currLabel={currLabel}
          prevLabel={prevLabel}
          currTotal={s.currTotal}
          prevTotal={s.prevTotal}
          rows={s.rows}
          fmt={formatARS}
        />
      ))}

      <CompareSheet
        title="Dólares"
        currLabel={currLabel}
        prevLabel={prevLabel}
        currTotal={wallets.dolaresNet.curr}
        prevTotal={wallets.dolaresNet.prev}
        rows={wallets.dolaresRows}
        fmt={formatUsd}
      />

      <CompareSheet
        title="Préstamo — lo prestado cada mes"
        currLabel={currLabel}
        prevLabel={prevLabel}
        currTotal={wallets.prestamoTotals.curr}
        prevTotal={wallets.prestamoTotals.prev}
        rows={wallets.prestamoRows}
        fmt={formatARS}
      />
    </div>
  );
}
