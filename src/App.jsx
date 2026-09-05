import { useEffect, useState } from 'react';
import { useAppState } from './lib/useAppState';
import { parseIncomeText } from './lib/parser';
import { downloadFile, exportStateAsJson, getLastBackupAt, setLastBackupAt } from './lib/storage';
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

  const showFloatingButtons = tab !== 'asistente';

  return (
    <div className={`mx-auto min-h-screen max-w-lg bg-gray-100 ${showFloatingButtons ? 'pb-40' : 'pb-20'}`}>
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold text-gray-900">Mis gastos y ahorro</h1>
      </header>

      <main className="px-4 pb-4">
        {tab === 'dashboard' && <Dashboard state={state} actions={actions} />}
        {tab === 'movimientos' && <MovimientosTable state={state} actions={actions} />}
        {tab === 'reportes' && <Reportes state={state} />}
        {tab === 'asistente' && <Asistente state={state} />}
        {tab === 'ajustes' && <Ajustes state={state} actions={actions} />}
      </main>

      {showFloatingButtons && (
        <div className="fixed inset-x-0 bottom-16 mx-auto flex max-w-lg gap-3 bg-gradient-to-t from-gray-100 via-gray-100/95 to-transparent p-4 pt-6">
          <button
            onClick={() => setShowExpenseForm(true)}
            className="flex-1 rounded-xl bg-gray-900 py-4 text-base font-semibold text-white shadow-lg"
          >
            + Nuevo gasto
          </button>
          <button
            onClick={() => setQuickIncomeOpen(true)}
            className="flex-1 rounded-xl bg-ok py-4 text-base font-semibold text-white shadow-lg"
          >
            + Nuevo ingreso
          </button>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-lg border-t border-gray-200 bg-white">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              tab === t.id ? 'text-gray-900' : 'text-gray-400'
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
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

