import { downloadFile } from './storage';

function csvEscape(value) {
  const str = String(value ?? '');
  if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportMovementsCsv(state) {
  const groupName = (id) => state.groups.find((g) => g.id === id)?.name || '';
  const subName = (id) => state.subcategories.find((s) => s.id === id)?.name || '';

  const rows = [
    ['tipo', 'fecha', 'monto', 'grupo', 'subcategoria', 'tipo_gasto', 'descripcion', 'metodo_carga'],
  ];

  for (const e of state.expenses) {
    rows.push([
      'gasto', e.date, e.amount, groupName(e.groupId), subName(e.subcategoryId),
      e.type, e.description, e.inputMethod,
    ]);
  }
  for (const i of state.incomes) {
    rows.push(['ingreso', i.date, i.amount, '', '', '', i.description, i.inputMethod]);
  }

  for (const x of state.exchanges || []) {
    rows.push(['compra_usd', x.date, x.ars, '', '', '', `US$ ${x.usd} a ${x.rate}${x.description ? ' ' + x.description : ''}`, 'formulario']);
  }

  const csv = rows.map((r) => r.map(csvEscape).join(';')).join('\n');
  downloadFile(`movimientos_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
}
