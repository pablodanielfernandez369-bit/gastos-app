import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import PeriodFilter from './PeriodFilter';
import PriceAlerts from './PriceAlerts';
import MonoChip from './MonoChip';
import { computeTotals, computeMonthlySeries, personNames, personTotal, computeMonthlySeriesForPerson } from '../lib/selectors';
import { formatARS, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';

const SUB_COLORS = ['#B0491F', '#1F5673', '#6D4B8F', '#5A7D2A', '#C77B2C', '#0F766E', '#A23B2B', '#8A7A5C'];
const AXIS = '#A39D90';
const GRID = '#E4DED1';

function formatUsd(n) {
  return `US$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n || 0)}`;
}

// Referencia de categorías con el mismo chip de color que ya se ve en
// Billeteras y Movimientos, en vez del legend por defecto de los gráficos.
function MonoLegend({ data, fmt }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2 rounded-full border border-hair bg-surface-2 px-2.5 py-1.5 text-xs">
          <MonoChip color={d.color} letter={d.name.charAt(0).toUpperCase()} size={20} />
          <span className="font-medium text-ink">{d.name}</span>
          <span className="font-numeral text-ink-faint num">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reportes({ state }) {
  const [period, setPeriod] = useState('mes');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());

  const [from, to] = useMemo(
    () => rangeForPeriod(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const totals = useMemo(() => computeTotals(state, from, to), [state, from, to]);
  const monthlySeries = useMemo(() => computeMonthlySeries(state), [state]);

  // Un gráfico de torta en pesos y, si hay actividad, otro en dólares —
  // nunca se mezclan en el mismo.
  const pieData = state.groups
    .map((g) => ({ name: g.name, value: totals.expenseByGroup[g.id]?.ars || 0, color: g.color }))
    .filter((d) => d.value > 0);
  if (totals.expenseByGroup._sinCategoria?.ars > 0) {
    pieData.push({ name: 'Sin categorizar', value: totals.expenseByGroup._sinCategoria.ars, color: '#A39D90' });
  }
  const pieDataUsd = state.groups
    .map((g) => ({ name: g.name, value: totals.expenseByGroup[g.id]?.usd || 0, color: g.color }))
    .filter((d) => d.value > 0);
  if (totals.expenseByGroup._sinCategoria?.usd > 0) {
    pieDataUsd.push({ name: 'Sin categorizar', value: totals.expenseByGroup._sinCategoria.usd, color: '#A39D90' });
  }

  const subName = (subId) =>
    subId === 'sin-subcategoria' ? 'Sin subcategoría' : (state.subcategories.find((s) => s.id === subId)?.name || '?');
  const subData = Object.entries(totals.expenseBySubcategory)
    .map(([subId, bucket]) => ({ name: subName(subId), value: bucket.ars }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const subDataUsd = Object.entries(totals.expenseBySubcategory)
    .map(([subId, bucket]) => ({ name: subName(subId), value: bucket.usd }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <PeriodFilter
        period={period}
        setPeriod={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
      />

      <section className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por categoría · pesos</h3>
        {pieData.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d, idx) => <Cell key={idx} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => formatARS(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {pieData.length > 0 && <MonoLegend data={pieData} fmt={formatARS} />}
      </section>

      {pieDataUsd.length > 0 && (
        <section className="rounded-2xl border border-hair bg-surface p-4">
          <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por categoría · dólares</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieDataUsd} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieDataUsd.map((d, idx) => <Cell key={idx} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v) => formatUsd(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <MonoLegend data={pieDataUsd} fmt={formatUsd} />
        </section>
      )}

      <section className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por subcategoría · pesos</h3>
        {subData.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: AXIS }} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {subData.map((_, idx) => <Cell key={idx} fill={SUB_COLORS[idx % SUB_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {subDataUsd.length > 0 && (
        <section className="rounded-2xl border border-hair bg-surface p-4">
          <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por subcategoría · dólares</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subDataUsd} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: AXIS }} />
                <Tooltip formatter={(v) => formatUsd(v)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {subDataUsd.map((_, idx) => <Cell key={idx} fill={SUB_COLORS[idx % SUB_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Evolución mensual · pesos</h3>
        {monthlySeries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} width={70} tickFormatter={(v) => formatARS(v)} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#5A7D2A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#A23B2B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ahorro" fill="#1F5673" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {monthlySeries.some((m) => m.IngresosUSD || m.GastosUSD) && (
        <section className="rounded-2xl border border-hair bg-surface p-4">
          <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Evolución mensual · dólares</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} />
                <YAxis tick={{ fontSize: 11, fill: AXIS }} width={70} tickFormatter={(v) => formatUsd(v)} />
                <Tooltip formatter={(v) => formatUsd(v)} />
                <Legend />
                <Bar dataKey="IngresosUSD" name="Ingresos" fill="#5A7D2A" radius={[4, 4, 0, 0]} />
                <Bar dataKey="GastosUSD" name="Gastos" fill="#A23B2B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="AhorroUSD" name="Ahorro" fill="#1F5673" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <MonthComparison series={monthlySeries} />

      <PersonExpenses state={state} from={from} to={to} />

      <PriceAlerts state={state} />
    </div>
  );
}

function MonthComparison({ series }) {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const curr = series[series.length - 1];

  const delta = (a, b) => (a === 0 ? null : ((b - a) / a) * 100);
  const rows = [
    { label: 'Ingresos', prev: prev.Ingresos, curr: curr.Ingresos, fmt: formatARS },
    { label: 'Gastos', prev: prev.Gastos, curr: curr.Gastos, fmt: formatARS },
    { label: 'Ahorro', prev: prev.Ahorro, curr: curr.Ahorro, fmt: formatARS },
  ];
  if (prev.IngresosUSD || curr.IngresosUSD || prev.GastosUSD || curr.GastosUSD) {
    rows.push(
      { label: 'Ingresos USD', prev: prev.IngresosUSD, curr: curr.IngresosUSD, fmt: formatUsd },
      { label: 'Gastos USD', prev: prev.GastosUSD, curr: curr.GastosUSD, fmt: formatUsd },
      { label: 'Ahorro USD', prev: prev.AhorroUSD, curr: curr.AhorroUSD, fmt: formatUsd }
    );
  }

  return (
    <section className="rounded-2xl border border-hair bg-surface p-4">
      <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">
        {prev.label} vs {curr.label}
      </h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const pct = delta(r.prev, r.curr);
            const up = pct !== null && pct > 0;
            return (
              <tr key={r.label} className="border-b border-hair last:border-0">
                <td className="py-1.5 text-ink-soft">{r.label}</td>
                <td className="py-1.5 text-right text-ink">{r.fmt(r.prev)}</td>
                <td className="py-1.5 text-right font-medium text-ink">{r.fmt(r.curr)}</td>
                <td className={`py-1.5 pl-2 text-right text-xs ${pct === null ? 'text-ink-faint' : up ? 'text-ok' : 'text-warn'}`}>
                  {pct === null ? '—' : `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// Gastos etiquetados con un nombre (campo opcional "Nombre" del formulario,
// ej "Mel"): total del período elegido arriba + evolución mes a mes.
function PersonExpenses({ state, from, to }) {
  const names = useMemo(() => personNames(state), [state]);
  const [person, setPerson] = useState(null);
  const selected = person && names.includes(person) ? person : names.find((n) => n === 'Mel') || names[0];

  const total = useMemo(
    () => (selected ? personTotal(state, from, to, selected) : { ars: 0, usd: 0 }),
    [state, from, to, selected]
  );
  const series = useMemo(
    () => (selected ? computeMonthlySeriesForPerson(state, selected) : []),
    [state, selected]
  );

  if (names.length === 0) return null;

  return (
    <section className="rounded-2xl border border-hair bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[0.95rem] font-medium text-ink">Gastos por persona</h3>
        {names.length > 1 && (
          <select
            className="rounded-lg border border-hair bg-surface px-2 py-1 text-sm text-ink"
            value={selected}
            onChange={(e) => setPerson(e.target.value)}
          >
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
        {selected} · período elegido
      </p>
      <p className="mt-1 font-numeral text-2xl font-medium text-ink num">{formatARS(total.ars)}</p>
      {total.usd > 0 && (
        <p className="text-sm font-medium text-ink-soft num">{formatUsd(total.usd)}</p>
      )}

      {series.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="2 4" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} width={60} tickFormatter={(v) => formatARS(v)} />
              <Tooltip formatter={(v) => formatARS(v)} />
              <Bar dataKey="Gastos" fill="#6D4B8F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return <p className="py-8 text-center text-sm text-ink-faint">Todavía no hay datos suficientes.</p>;
}
