import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import PeriodFilter from './PeriodFilter';
import PriceAlerts from './PriceAlerts';
import { computeTotals, computeMonthlySeries, personNames, personTotal, computeMonthlySeriesForPerson, antExpenses } from '../lib/selectors';
import { formatARS, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';

const SUB_COLORS = ['#B0491F', '#1F5673', '#6D4B8F', '#5A7D2A', '#C77B2C', '#0F766E', '#A23B2B', '#8A7A5C'];
const AXIS = '#A39D90';
const GRID = '#E4DED1';

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
  const hormigas = useMemo(() => antExpenses(state, from, to), [state, from, to]);

  const pieData = state.groups
    .map((g) => ({ name: g.name, value: totals.expenseByGroup[g.id] || 0, color: g.color }))
    .filter((d) => d.value > 0);
  if (totals.expenseByGroup._sinCategoria > 0) {
    pieData.push({ name: 'Sin categorizar', value: totals.expenseByGroup._sinCategoria, color: '#A39D90' });
  }

  const subData = Object.entries(totals.expenseBySubcategory)
    .map(([subId, value]) => ({
      name: subId === 'sin-subcategoria' ? 'Sin subcategoría' : (state.subcategories.find((s) => s.id === subId)?.name || '?'),
      value,
    }))
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
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por categoría</h3>
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
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Gastos por subcategoría</h3>
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

      <section className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-3 font-display text-[0.95rem] font-medium text-ink">Evolución mensual</h3>
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

      <MonthComparison series={monthlySeries} />

      <AntExpenses items={hormigas} />

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
    { label: 'Ingresos', prev: prev.Ingresos, curr: curr.Ingresos },
    { label: 'Gastos', prev: prev.Gastos, curr: curr.Gastos },
    { label: 'Ahorro', prev: prev.Ahorro, curr: curr.Ahorro },
  ];

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
                <td className="py-1.5 text-right text-ink">{formatARS(r.prev)}</td>
                <td className="py-1.5 text-right font-medium text-ink">{formatARS(r.curr)}</td>
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

// Subcategorías con varias compras chicas repetidas en el período (delivery,
// cafecitos...) juntadas en un solo total, para que se note el impacto real
// de algo que gasto por gasto parece insignificante.
function AntExpenses({ items }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-hair bg-surface p-4">
      <h3 className="font-display text-[0.95rem] font-medium text-ink">Gastos hormiga</h3>
      <p className="mb-3 text-xs text-ink-faint">Cosas chicas que se repiten y suman más de lo que parece.</p>
      <ul className="space-y-2.5">
        {items.map((it) => (
          <li key={it.subcategoryId || it.groupId || it.name} className="flex items-center justify-between text-sm">
            <span className="text-ink">
              {it.name} <span className="text-ink-faint">· {it.count} veces</span>
            </span>
            <span className="text-right">
              <span className="font-medium text-ink num">{formatARS(it.total)}</span>
              <span className="ml-1.5 text-xs text-ink-faint num">(prom. {formatARS(it.avg)})</span>
            </span>
          </li>
        ))}
      </ul>
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
    () => (selected ? personTotal(state, from, to, selected) : 0),
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
      <p className="mt-1 font-display text-2xl font-medium text-ink num">{formatARS(total)}</p>

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
