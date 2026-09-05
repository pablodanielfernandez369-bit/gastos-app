import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import PeriodFilter from './PeriodFilter';
import PriceAlerts from './PriceAlerts';
import { computeTotals, computeMonthlySeries } from '../lib/selectors';
import { formatARS, rangeForPeriod } from '../lib/format';
import { todayISO } from '../lib/model';

const SUB_COLORS = ['#2563eb', '#d97706', '#0891b2', '#7c3aed', '#db2777', '#65a30d', '#ea580c', '#0284c7'];

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

  const pieData = state.groups
    .map((g) => ({ name: g.name, value: totals.expenseByGroup[g.id] || 0, color: g.color }))
    .filter((d) => d.value > 0);
  if (totals.expenseByGroup._sinCategoria > 0) {
    pieData.push({ name: 'Sin categorizar', value: totals.expenseByGroup._sinCategoria, color: '#9ca3af' });
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

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Gastos por categoría</h3>
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

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Gastos por subcategoría</h3>
        {subData.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {subData.map((_, idx) => <Cell key={idx} fill={SUB_COLORS[idx % SUB_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Evolución mensual</h3>
        {monthlySeries.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatARS(v)} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ahorro" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <MonthComparison series={monthlySeries} />

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
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">
        {prev.label} vs {curr.label}
      </h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const pct = delta(r.prev, r.curr);
            const up = pct !== null && pct > 0;
            return (
              <tr key={r.label} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-500">{r.label}</td>
                <td className="py-1.5 text-right text-gray-700">{formatARS(r.prev)}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">{formatARS(r.curr)}</td>
                <td className={`py-1.5 pl-2 text-right text-xs ${pct === null ? 'text-gray-400' : up ? 'text-ok' : 'text-warn'}`}>
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

function EmptyState() {
  return <p className="py-8 text-center text-sm text-gray-400">Todavía no hay datos suficientes.</p>;
}
