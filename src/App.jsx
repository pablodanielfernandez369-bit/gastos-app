import { useEffect, useState } from 'react';
import { useAppState } from './lib/useAppState';
import {
  downloadFile,
  exportStateAsJson,
  getLastBackupAt,
  setLastBackupAt,
} from './lib/storage';
import { todayISO } from './lib/model';
import ExpenseFormModal from './components/ExpenseFormModal';
import IncomeFormModal from './components/IncomeFormModal';
import ExchangeFormModal from './components/ExchangeFormModal';
import Dashboard from './components/Dashboard';
import MovimientosTable from './components/MovimientosTable';
import Reportes from './components/Reportes';
import Ajustes from './components/Ajustes';
import Asistente from './components/Asistente';
import NavIcon from './components/NavIcons';
import PrintWallets from './components/PrintWallets';
import PrintComparison from './components/PrintComparison';

const TABS = [
  { id: 'dashboard', label: 'Ahorro' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'asistente', label: 'Asistente' },
  { id: 'ajustes', label: 'Ajustes' },
];

export default function App() {
  const [state, actions] = useAppState();
  const [tab, setTab] = useState('dashboard');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExchangeForm, setShowExchangeForm] = useState(false);

  // Backup automático silencioso: si pasó más de un día desde el último,
  // lo descarga solo a Descargas al abrir la app (no depende de un horario
  // exacto, porque nada corre en segundo plano si la app está cerrada).
  useEffect(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const last = getLastBackupAt();
    if (last && Date.now() - last < ONE_DAY_MS) return;

    if (state.expenses.length > 0 || state.incomes.length > 0) {
      downloadFile(`backup_gastos_${todayISO()}.json`, exportStateAsJson(state), 'application/json');
    }
    setLastBackupAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El backup a Telegram ya NO depende de abrir la app: lo dispara un cron
  // en el servidor (POST /api/backup-cron, ver server.js) leyendo el estado
  // directo de Supabase. El botón manual de Ajustes sigue andando igual.

  const showFloatingButtons = tab !== 'asistente' && tab !== 'ajustes';

  // El contenido y las barras comparten el mismo ancho responsive: angosto
  // en un celular normal (o el Fold plegado), más ancho al desplegar un
  // Fold/tablet para aprovechar el espacio horizontal.
  const WIDTH = 'max-w-lg sm:max-w-2xl lg:max-w-3xl';

  // Header, botones y nav NO son "fixed" (eso depende de cálculos de altura
  // de viewport que en algunos celulares fallan y hacen que la barra de
  // abajo quede corrida, pidiendo scroll para verla). En cambio, todo el
  // shell es una columna flex de altura exacta (h-dvh): header/botones/nav
  // ocupan su alto natural y quedan siempre visibles, y <main> es la ÚNICA
  // zona que scrollea, en el espacio que sobra.
  return (
    <>
    <div className={`app-shell mx-auto flex h-dvh flex-col ${WIDTH} bg-paper`}>
      <header className="shrink-0 px-4 pb-3 pt-[max(1.75rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-tight text-ink">
          Mis gastos y ahorro
        </h1>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === 'dashboard' && <Dashboard state={state} actions={actions} />}
        {tab === 'movimientos' && <MovimientosTable state={state} actions={actions} />}
        {tab === 'reportes' && <Reportes state={state} />}
        {tab === 'asistente' && <Asistente state={state} />}
        {tab === 'ajustes' && <Ajustes state={state} actions={actions} />}
      </main>

      {showFloatingButtons && (
        <div className="flex shrink-0 gap-2.5 px-4 pb-3 pt-2">
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex-1 rounded-2xl py-3.5 text-[0.95rem] font-semibold tracking-tight text-paper shadow-[0_8px_20px_-6px_rgba(176,73,31,0.4)]"
            style={{ background: 'linear-gradient(180deg, color-mix(in srgb, #B0491F 78%, white) 0%, #B0491F 100%)' }}
          >
            + Nuevo gasto
          </button>
          <button
            onClick={() => setShowIncomeForm(true)}
            className="flex-1 rounded-2xl border border-ok/25 py-3.5 text-[0.95rem] font-semibold tracking-tight text-ok"
            style={{ background: 'linear-gradient(180deg, color-mix(in srgb, #5A7D2A 8%, #FCFAF5) 0%, color-mix(in srgb, #5A7D2A 16%, #FCFAF5) 100%)' }}
          >
            + Nuevo ingreso
          </button>
          <button
            onClick={() => setShowExchangeForm(true)}
            aria-label="Compré dólares"
            className="shrink-0 rounded-2xl border border-hair bg-surface px-4 py-3.5 text-[0.95rem] font-semibold tracking-tight text-ink"
          >
            US$
          </button>
        </div>
      )}

      <nav className="flex shrink-0 border-t border-hair bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-label={t.label}
            aria-pressed={tab === t.id}
            className={`flex flex-1 flex-col items-center gap-1.5 py-2.5 transition-colors ${
              tab === t.id ? 'text-accent' : 'text-ink-faint'
            }`}
          >
            <NavIcon id={t.id} className="h-[25px] w-[25px]" />
            <span className={`h-1 w-1 rounded-full transition-colors ${tab === t.id ? 'bg-accent' : 'bg-transparent'}`} />
          </button>
        ))}
      </nav>

      {showExpenseForm && (
        <ExpenseFormModal
          open
          onClose={() => setShowExpenseForm(false)}
          draft={null}
          state={state}
          actions={actions}
        />
      )}

      {showExchangeForm && (
        <ExchangeFormModal open onClose={() => setShowExchangeForm(false)} draft={null} actions={actions} />
      )}

      {showIncomeForm && (
        <IncomeFormModal
          open
          onClose={() => setShowIncomeForm(false)}
          draft={null}
          state={state}
          actions={actions}
        />
      )}
    </div>
    <PrintWallets state={state} />
    <PrintComparison state={state} />
    </>
  );
}

