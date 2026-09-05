import CategoryManager from './CategoryManager';
import RecurringManager from './RecurringManager';
import BackupRestore from './BackupRestore';

export default function Ajustes({ state, actions }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Categorías</h2>
        <CategoryManager state={state} actions={actions} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Recordatorios</h2>
        <RecurringManager state={state} actions={actions} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Datos</h2>
        <BackupRestore state={state} actions={actions} />
      </div>
    </div>
  );
}
