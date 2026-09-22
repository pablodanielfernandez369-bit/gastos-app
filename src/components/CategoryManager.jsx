import { useState } from 'react';
import MonoChip from './MonoChip';

export default function CategoryManager({ state, actions }) {
  const [newGroupName, setNewGroupName] = useState('');
  const [newSubByGroup, setNewSubByGroup] = useState({});
  const [renaming, setRenaming] = useState(null); // subcategory id

  function handleAddGroup() {
    if (!newGroupName.trim()) return;
    actions.addGroup(newGroupName.trim());
    setNewGroupName('');
  }

  function handleAddSub(groupId) {
    const name = (newSubByGroup[groupId] || '').trim();
    if (!name) return;
    actions.addSubcategory(groupId, name);
    setNewSubByGroup((s) => ({ ...s, [groupId]: '' }));
  }

  function handleDeleteSub(sub) {
    const inUse = state.expenses.some((e) => e.subcategoryId === sub.id);
    const msg = inUse
      ? `"${sub.name}" tiene gastos cargados. Si la borrás, esos gastos van a quedar sin subcategoría. ¿Continuar?`
      : `¿Borrar la subcategoría "${sub.name}"?`;
    if (!confirm(msg)) return;
    actions.deleteSubcategory(sub.id);
  }

  return (
    <div className="space-y-4">
      {state.groups.map((g) => (
        <div key={g.id} className="rounded-2xl border border-hair bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <MonoChip color={g.color} letter={g.name.charAt(0).toUpperCase()} size={24} />
            {g.name}
          </h3>
          <ul className="space-y-1">
            {state.subcategories.filter((s) => s.groupId === g.id).map((sub) => (
              <li key={sub.id} className="flex items-center gap-2">
                {renaming === sub.id ? (
                  <RenameInput
                    initial={sub.name}
                    onCancel={() => setRenaming(null)}
                    onSave={(name) => { actions.renameSubcategory(sub.id, name); setRenaming(null); }}
                  />
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink">{sub.name}</span>
                    <button onClick={() => setRenaming(sub.id)} className="text-ink-faint">✏️</button>
                    <button onClick={() => handleDeleteSub(sub)} className="text-ink-faint">🗑️</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded-lg border border-hair px-2 py-1.5 text-sm"
              placeholder="Nueva subcategoría"
              value={newSubByGroup[g.id] || ''}
              onChange={(e) => setNewSubByGroup((s) => ({ ...s, [g.id]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSub(g.id)}
            />
            <button
              onClick={() => handleAddSub(g.id)}
              className="rounded-lg border border-hair px-3 py-1.5 text-sm text-ink-soft"
            >
              + agregar
            </button>
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-hair bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Nueva categoría principal</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-hair px-2 py-1.5 text-sm"
            placeholder="ej: Vehículo"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
          />
          <button
            onClick={handleAddGroup}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm text-paper"
          >
            Crear
          </button>
        </div>
      </div>
    </div>
  );
}

function RenameInput({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-1 gap-2">
      <input
        autoFocus
        className="flex-1 rounded-lg border border-hair px-2 py-1 text-sm"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && value.trim() && onSave(value.trim())}
      />
      <button onClick={() => value.trim() && onSave(value.trim())} className="text-ok">✓</button>
      <button onClick={onCancel} className="text-ink-faint">✕</button>
    </div>
  );
}
