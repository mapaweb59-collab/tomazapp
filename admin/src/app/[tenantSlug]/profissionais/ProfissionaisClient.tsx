'use client';

import { useState, useTransition } from 'react';
import { createProfissional, toggleProfissional, updateProfissional } from './actions';

interface Professional {
  id: string;
  name: string;
  aliases: string[];
  specialties: string[];
  gcal_calendar_id?: string;
  active: boolean;
}

interface Props {
  tenantSlug: string;
  professionals: Professional[];
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => (
        <span key={item} className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full">
          {item}
        </span>
      ))}
    </div>
  );
}

function AddForm({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      await createProfissional(tenantSlug, formData);
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        + Adicionar profissional
      </button>
    );
  }

  return (
    <form action={submit} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">Novo profissional</h3>

      <input name="name" required placeholder="Nome" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="aliases" placeholder="Apelidos (separados por vírgula)" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="specialties" placeholder="Especialidades (separadas por vírgula)" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="gcal_calendar_id" placeholder="Google Calendar ID (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm" />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ProfRow({ prof, tenantSlug }: { prof: Professional; tenantSlug: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(prof.name);
  const [aliases, setAliases] = useState(prof.aliases.join(', '));
  const [specialties, setSpecialties] = useState(prof.specialties.join(', '));
  const [gcal, setGcal] = useState(prof.gcal_calendar_id ?? '');

  function saveEdit() {
    startTransition(async () => {
      await updateProfissional(tenantSlug, prof.id, {
        name,
        aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
        specialties: specialties.split(',').map(s => s.trim()).filter(Boolean),
        gcal_calendar_id: gcal || undefined,
      });
      setEditing(false);
    });
  }

  function toggle() {
    startTransition(() => toggleProfissional(tenantSlug, prof.id, !prof.active));
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm font-medium" />
        <input value={aliases} onChange={e => setAliases(e.target.value)} placeholder="Apelidos" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={specialties} onChange={e => setSpecialties(e.target.value)} placeholder="Especialidades" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={gcal} onChange={e => setGcal(e.target.value)} placeholder="GCal ID" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={pending} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {pending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-lg border">Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 ${!prof.active ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <p className="font-semibold text-gray-900">{prof.name}</p>
          <div>
            <p className="text-xs text-gray-400 mb-1">Apelidos</p>
            <ChipList items={prof.aliases} />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Especialidades</p>
            <ChipList items={prof.specialties} />
          </div>
          {prof.gcal_calendar_id && (
            <p className="text-xs text-gray-400">GCal: {prof.gcal_calendar_id}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">
            Editar
          </button>
          <button
            onClick={toggle}
            disabled={pending}
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              prof.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {prof.active ? 'Ativo' : 'Inativo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProfissionaisClient({ tenantSlug, professionals }: Props) {
  return (
    <div className="space-y-4">
      <AddForm tenantSlug={tenantSlug} />
      {professionals.map(p => (
        <ProfRow key={p.id} prof={p} tenantSlug={tenantSlug} />
      ))}
      {professionals.length === 0 && (
        <p className="text-gray-500 text-sm">Nenhum profissional cadastrado.</p>
      )}
    </div>
  );
}
