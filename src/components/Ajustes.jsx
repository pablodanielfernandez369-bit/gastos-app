import CategoryManager from './CategoryManager';
import RecurringManager from './RecurringManager';
import BackupRestore from './BackupRestore';
import GoalsManager from './GoalsManager';

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

export default function Ajustes({ state, actions }) {
  return (
    <div className="space-y-7">
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
    </div>
  );
}
