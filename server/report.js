// Resumen semanal como imagen (para mandar al chat de Telegram los domingos).
// Arma un SVG y lo rasteriza a PNG con resvg (fuente Inter embebida, sin
// depender de fuentes del sistema).

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Resvg } from '@resvg/resvg-js';
import { getState } from './supabase.js';
import { getDolarBlue } from './dolar.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT = readFileSync(join(__dirname, 'assets', 'Inter.ttf'));

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function ars(n) {
  return '$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
}
function usd(n) {
  return 'US$ ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mondayOf(d) {
  const x = new Date(d);
  const day = x.getDay() || 7; // lun=1..dom=7
  x.setDate(x.getDate() - day + 1);
  x.setHours(0, 0, 0, 0);
  return x;
}
const iso = (d) => new Date(d).toISOString().slice(0, 10);

export function buildWeekData(state, dolar, now = new Date()) {
  const mon = mondayOf(now);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7);
  const prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1);

  const inRange = (date, a, b) => date >= iso(a) && date <= iso(b);
  const weekExp = state.expenses.filter((e) => inRange(e.date, mon, sun));
  const prevExp = state.expenses.filter((e) => inRange(e.date, prevMon, prevSun));

  const total = weekExp.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevExp.reduce((s, e) => s + e.amount, 0);
  const deltaPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;

  const byGroup = {};
  for (const e of weekExp) {
    const g = state.groups.find((x) => x.id === e.groupId);
    const name = g ? g.name : 'Sin categoría';
    if (!byGroup[name]) byGroup[name] = { name, amount: 0, color: g?.color || '#94a3b8' };
    byGroup[name].amount += e.amount;
  }
  const groups = Object.values(byGroup).sort((a, b) => b.amount - a.amount).slice(0, 4);

  // Contexto mensual
  const mk = iso(now).slice(0, 7);
  const inMonth = (d) => (d || '').slice(0, 7) === mk;
  const cfg = state.config || {};
  const monthExp = state.expenses.filter((e) => inMonth(e.date));
  const monthInc = state.incomes.filter((i) => inMonth(i.date));
  const extrasSpent = monthExp.filter((e) => e.groupId === cfg.extrasGroupId).reduce((s, e) => s + e.amount, 0);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const savingsNow = monthInc.reduce((s, i) => s + i.amount, 0) - monthExp.reduce((s, e) => s + e.amount, 0);

  const rate = cfg.fxRateManual || dolar?.venta || cfg.fxRate || null;

  return {
    from: mon, to: sun, now,
    total, deltaPct, groups,
    usdTotal: rate ? total / rate : null,
    extras: cfg.extrasBudget
      ? { spent: extrasSpent, budget: cfg.extrasBudget, pct: extrasSpent / cfg.extrasBudget, left: cfg.extrasBudget - extrasSpent, daysLeft }
      : null,
    savings: cfg.savingsGoal ? { now: savingsNow, goal: cfg.savingsGoal, pct: savingsNow / cfg.savingsGoal } : null,
  };
}

function bar(x, y, w, h, pct, color, track = '#E4DED1') {
  const fill = Math.max(0, Math.min(1, pct)) * w;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${track}"/>` +
    (fill > 0 ? `<rect x="${x}" y="${y}" width="${fill}" height="${h}" rx="${h / 2}" fill="${color}"/>` : '');
}

// Paleta editorial "papel cálido" (misma que la app)
const C = {
  paper: '#F6F3EC', surface: '#FCFAF5', ink: '#211E1A', soft: '#6F6A60',
  faint: '#A39D90', hair: '#E4DED1', accent: '#B0491F', ok: '#5A7D2A',
  caution: '#C77B2C', warn: '#A23B2B',
};

export function renderReportSvg(d) {
  const W = 1080, H = 1240;
  const rango = `${d.from.getDate()} – ${d.to.getDate()} de ${MESES[d.to.getMonth()]}`;
  const T = (x, y, s, txt, opts = {}) =>
    `<text x="${x}" y="${y}" font-family="Inter" font-size="${s}" font-weight="${opts.w || 400}" letter-spacing="${opts.ls || 0}" fill="${opts.fill || C.ink}" ${opts.anchor ? `text-anchor="${opts.anchor}"` : ''}>${esc(txt)}</text>`;
  const label = (x, y, txt) => T(x, y, 22, txt.toUpperCase(), { w: 600, fill: C.faint, ls: 2.6 });

  let y = 128;
  const parts = [
    `<rect width="${W}" height="${H}" fill="${C.paper}"/>`,
    `<rect x="0" y="0" width="${W}" height="10" fill="${C.accent}"/>`,
    label(80, y, 'Resumen semanal'),
    T(80, y + 44, 30, rango, { fill: C.soft }),
  ];

  y = 244;
  parts.push(label(80, y, 'Gastaste esta semana'));
  parts.push(T(80, y + 82, 88, ars(d.total), { w: 600, fill: C.ink }));
  y += 132;
  let sub = d.usdTotal ? usd(d.usdTotal) : '';
  if (d.deltaPct != null) {
    const up = d.deltaPct > 0;
    const abs = Math.abs(d.deltaPct);
    const pct = abs > 200 ? '+200%' : `${abs.toFixed(0)}%`;
    sub += (sub ? '   ·   ' : '') + `${up ? '▲' : '▼'} ${pct} vs semana pasada`;
    parts.push(T(80, y, 28, sub, { fill: up ? C.warn : C.ok, w: 500 }));
  } else if (sub) {
    parts.push(T(80, y, 28, sub, { fill: C.soft }));
  }

  // En qué
  y = 466;
  parts.push(label(80, y, 'En qué'));
  y += 50;
  const max = Math.max(1, ...d.groups.map((g) => g.amount));
  for (const g of d.groups) {
    parts.push(T(80, y, 30, g.name, { fill: C.ink }));
    parts.push(T(W - 80, y, 30, ars(g.amount), { w: 600, fill: C.ink, anchor: 'end' }));
    parts.push(bar(80, y + 18, W - 160, 12, g.amount / max, g.color || C.faint));
    y += 76;
  }

  const semColor = (pct) => (pct >= 0.9 ? C.warn : pct >= 0.7 ? C.caution : C.ok);

  // Presupuesto de salidas
  if (d.extras) {
    y += 34;
    parts.push(label(80, y, 'Presupuesto de salidas · mes'));
    y += 52;
    parts.push(T(80, y, 36, `${ars(d.extras.spent)} de ${ars(d.extras.budget)}`, { w: 500, fill: C.ink }));
    parts.push(T(W - 80, y, 36, `${Math.round(d.extras.pct * 100)}%`, { w: 600, anchor: 'end', fill: semColor(d.extras.pct) }));
    y += 26;
    parts.push(bar(80, y, W - 160, 18, d.extras.pct, semColor(d.extras.pct), C.hair));
    y += 52;
    const leftTxt = d.extras.left >= 0
      ? `Quedan ${ars(d.extras.left)} para ${d.extras.daysLeft} días`
      : `Te pasaste ${ars(-d.extras.left)}`;
    parts.push(T(80, y, 26, leftTxt, { fill: C.soft }));
  }

  // Ahorro del mes
  if (d.savings) {
    y += 92;
    parts.push(label(80, y, 'Ahorro del mes'));
    y += 52;
    const ok = d.savings.now >= d.savings.goal;
    parts.push(T(80, y, 36, `${ars(d.savings.now)} de ${ars(d.savings.goal)}`, { w: 500, fill: C.ink }));
    parts.push(T(W - 80, y, 36, `${ok ? '✓ ' : ''}${Math.round(d.savings.pct * 100)}%`, { w: 600, anchor: 'end', fill: ok ? C.ok : C.caution }));
    y += 26;
    parts.push(bar(80, y, W - 160, 18, d.savings.pct, ok ? C.ok : C.caution, C.hair));
  }

  parts.push(T(80, H - 58, 24, 'mis gastos y ahorro', { fill: C.faint }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

export function renderReportPng(d) {
  const svg = renderReportSvg(d);
  const r = new Resvg(svg, { font: { fontBuffers: [FONT], defaultFontFamily: 'Inter', loadSystemFonts: false } });
  return r.render().asPng();
}

// Arma y manda el resumen semanal al chat. Devuelve true si salió.
export async function sendWeeklyReport() {
  const { data: state } = await getState();
  if (!state || !state.groups) return false;
  const dolar = await getDolarBlue();
  const data = buildWeekData(state, dolar);
  const png = renderReportPng(data);

  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  form.append('caption', `Resumen ${data.from.getDate()}–${data.to.getDate()}/${data.to.getMonth() + 1}`);
  form.append('photo', new Blob([png], { type: 'image/png' }), 'resumen.png');

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  const j = await res.json();
  if (!j.ok) throw new Error(j.description || `Telegram ${res.status}`);
  return true;
}
