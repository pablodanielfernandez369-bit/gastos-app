import { useEffect, useState } from 'react';
import { useAppState } from './lib/useAppState';
import { parseIncomeText } from './lib/parser';
import {
  downloadFile,
  exportStateAsJson,
  getLastBackupAt,
  setLastBackupAt,
  getLastTelegramBackupAt,
  setLastTelegramBackupAt,
  sendTelegramBackup,
} from './lib/storage';
import { todayISO } from './lib/model';
import QuickEntrySheet from './components/QuickEntrySheet';
import ExpenseFormModal from './components/ExpenseFormModal';
import IncomeFormModal from './components/IncomeFormModal';
import Dashboard from './components/Dashboard';
import MovimientosTable from './components/MovimientosTable';
import Reportes from './components/Reportes';
import Ajustes from './components/Ajustes';
import Asistente from './components/Asistente';

const TABS = [
  { id: 'dashboard', label: 'Ahorro', icon: '💰' },
  { id: 'movimientos', label: 'Movimientos', icon: '📋' },
  { id: 'reportes', label: 'Reportes', icon: '📊' },
  { id: 'asistente', label: 'Asistente', icon: '🎙️' },
  { id: 'ajustes', label: 'Ajustes', icon: '⚙️' },
];

export default function App() {
  const [state, actions] = useAppState();
  const [tab, setTab] = useState('dashboard');

  const [quickIncomeOpen, setQuickIncomeOpen] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState(null);
  const [showIncomeForm, setShowIncomeForm] = useState(false);

  function handleQuickIncomeSubmit(rawText) {
    setIncomeDraft(parseIncomeText(rawText));
    setQuickIncomeOpen(false);
    setShowIncomeForm(true);
  }

  function openClassicIncomeForm() {
    setIncomeDraft(null);
    setShowIncomeForm(true);
    setQuickIncomeOpen(false);
  }

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

  // Backup automático al chat de Telegram: una vez por día al abrir la app.
  // Si el server todavía no tiene el bot configurado, falla en silencio y
  // se reintenta la próxima vez.
  useEffect(() => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const last = getLastTelegramBackupAt();
    if (last && Date.now() - last < ONE_DAY_MS) return;
    if (state.expenses.length === 0 && state.incomes.length === 0) return;

    sendTelegramBackup(state)
      .then(() => setLastTelegramBackupAt(Date.now()))
      .catch((e) => console.warn('Backup a Telegram no enviado:', e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showFloatingButtons = tab !== 'asistente' && tab !== 'ajustes';

  // El contenido y las barras fijas comparten el mismo ancho responsive:
  // angosto en un celular normal (o el Fold plegado), más ancho al
  // desplegar un Fold/tablet para aprovechar el espacio horizontal.
  const WIDTH = 'max-w-lg sm:max-w-2xl lg:max-w-3xl';

  return (
    <div className={`mx-auto min-h-screen ${WIDTH} bg-paper ${showFloatingButtons ? 'pb-40' : 'pb-20'}`}>
      <header className="px-4 pb-3 pt-[max(1.75rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-[1.7rem] font-medium leading-none tracking-tight text-ink">
          Mis gastos y ahorro
        </h1>
      </header>

      <main className="px-4 pb-4">
        {tab === 'dashboard' && <Dashboard state={state} actions={actions} />}
        {tab === 'movimientos' && <MovimientosTable state={state} actions={actions} />}
        {tab === 'reportes' && <Reportes state={state} />}
        {tab === 'asistente' && <Asistente state={state} />}
        {tab === 'ajustes' && <Ajustes state={state} actions={actions} />}
      </main>

      {showFloatingButtons && (
        <div className={`fixed inset-x-0 bottom-14 mx-auto flex ${WIDTH} gap-2.5 bg-gradient-to-t from-paper via-paper/95 to-transparent px-4 pb-3 pt-8`}>
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex-1 rounded-2xl bg-accent py-3.5 text-[0.95rem] font-semibold tracking-tight text-paper shadow-[0_8px_20px_-6px_rgba(176,73,31,0.4)]"
          >
            + Nuevo gasto
          </button>
          <button
            onClick={() => setQuickIncomeOpen(true)}
            className="flex-1 rounded-2xl border border-ok/25 bg-ok/10 py-3.5 text-[0.95rem] font-semibold tracking-tight text-ok"
          >
            + Nuevo ingreso
          </button>
        </div>
      )}

      <nav className={`fixed inset-x-0 bottom-0 mx-auto flex ${WIDTH} border-t border-hair bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium tracking-wide transition-colors ${
              tab === t.id ? 'text-accent' : 'text-ink-faint'
            }`}
          >
            <span className={`text-base leading-none transition-opacity ${tab === t.id ? 'opacity-100' : 'opacity-55'}`}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {quickIncomeOpen && (
        <QuickEntrySheet
          open
          onClose={() => setQuickIncomeOpen(false)}
          onSubmitText={handleQuickIncomeSubmit}
          onUseClassicForm={openClassicIncomeForm}
        />
      )}

      {showExpenseForm && (
        <ExpenseFormModal
          open
          onClose={() => setShowExpenseForm(false)}
          draft={null}
          state={state}
          actions={actions}
        />
      )}

      {showIncomeForm && (
        <IncomeFormModal
          open
          onClose={() => setShowIncomeForm(false)}
          draft={incomeDraft}
          actions={actions}
        />
      )}
    </div>
  );
}

