import { useState } from 'react';
import CategoryManager from './CategoryManager';
import RecurringManager from './RecurringManager';
import BackupRestore from './BackupRestore';
import GoalsManager from './GoalsManager';
import ChangeAccessCodeModal from './ChangeAccessCodeModal';
import WalletManager from './WalletManager';

function Section({ title, children }) {
  return (
    <section>
      <h2 className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Ajustes({ state, actions, walletId, wallets, onSwitchWallet, onCreateWallet, onDeleteWallet }) {
  const [showChangeCode, setShowChangeCode] = useState(false);
  return (
    <div className="space-y-7">
      <Section title="Billeteras">
        <WalletManager
          walletId={walletId}
          wallets={wallets}
          onSwitchWallet={onSwitchWallet}
          onCreateWallet={onCreateWallet}
          onDeleteWallet={onDeleteWallet}
        />
      </Section>
      <Section title="Metas del mes">
        <GoalsManager state={state} actions={actions} />
      </Section>
      <Section title="Categorías">
        <CategoryManager state={state} actions={actions} />
      </Section>
      <Section title="Recordatorios">
        <RecurringManager state={state} actions={actions} />
      </Section>
      <Section title="Datos">
        <BackupRestore state={state} actions={actions} />
      </Section>
      <Section title="Seguridad">
        <button
          type="button"
          onClick={() => setShowChangeCode(true)}
          className="w-full rounded-lg border border-hair bg-surface px-3 py-3 text-left text-sm font-medium text-ink"
        >
          Cambiar contraseña
        </button>
      </Section>
      <ChangeAccessCodeModal open={showChangeCode} onClose={() => setShowChangeCode(false)} />
    </div>
  );
}
