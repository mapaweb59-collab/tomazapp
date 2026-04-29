'use client';

import { useState, useTransition } from 'react';
import { createProfissional, toggleProfissional, updateProfissional } from './actions';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type DayKey = typeof DAY_KEYS[number];
const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom',
};

type BusinessHours = Record<DayKey, { open: string; close: string } | null>;

interface Professional {
  id: string;
  name: string;
  aliases: string[];
  specialties: string[];
  gcal_calendar_id?: string;
  business_hours?: BusinessHours | null;
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

function ScheduleEditor({ value, onChange }: { value: BusinessHours; onChange: (v: BusinessHours) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-700">Horários de atendimento</p>
      <p className="text-xs text-gray-400">Dias sem marcação = usa o horário geral do studio.</p>
      {DAY_KEYS.map(day => {
        const hours = value[day];
        const enabled = hours !== null;
        return (
          <div key={day} className="flex items-center gap-3">
            <label className="flex items-center gap-2 w-14 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e =>
                  onChange({ ...value, [day]: e.target.checked ? { open: '08:00', close: '18:00' } : null })
                }
              />
              <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
            </label>
            {enabled ? (
              <>
                <input
                  type="time"
                  value={hours!.open}
                  onChange={e => onChange({ ...value, [day]: { ...hours!, open: e.target.value } })}
                  className="border rounded px-2 py-1 text-sm w-28"
                />
                <span className="text-gray-400 text-sm">até</span>
                <input
                  type="time"
                  value={hours!.close}
                  onChange={e => onChange({ ...value, [day]: { ...hours!, close: e.target.value } })}
                  className="border rounded px-2 py-1 text-sm w-28"
                />
              </>
            ) : (
              <span className="text-xs text-gray-300 italic">fechado</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function emptySchedule(): BusinessHours {
  return { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
}

function scheduleFromDb(bh: BusinessHours | null | undefined): BusinessHours {
  return { ...emptySchedule(), ...(bh ?? {}) };
}

function AddForm({ tenantSlug }: { tenantSlug: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [schedule, setSchedule] = useState<BusinessHours>(emptySchedule());

  function submit(formData: FormData) {
    formData.set('business_hours', JSON.stringify(schedule));
    startTransition(async () => {
      await createProfissional(tenantSlug, formData);
      setOpen(false);
      setSchedule(emptySchedule());
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
        + Adicionar profissional
      </button>
    );
  }

  return (
    <form action={submit} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">Novo profissional</h3>
      <input name="name" required placeholder="Nome" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="aliases" placeholder="Apelidos (vírgula)" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="specialties" placeholder="Especialidades (vírgula)" className="w-full border rounded-lg px-3 py-2 text-sm" />
      <input name="gcal_calendar_id" placeholder="Google Calendar ID (opcional)" className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {pending ? 'Salvando...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">
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
  const [schedule, setSchedule] = useState<BusinessHours>(scheduleFromDb(prof.business_hours));

  function saveEdit() {
    startTransition(async () => {
      await updateProfissional(tenantSlug, prof.id, {
        name,
        aliases: aliases.split(',').map(s => s.trim()).filter(Boolean),
        specialties: specialties.split(',').map(s => s.trim()).filter(Boolean),
        gcal_calendar_id: gcal || undefined,
        business_hours: schedule,
      });
      setEditing(false);
    });
  }

  const activeDays = DAY_KEYS.filter(d => schedule[d] !== null);

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm font-medium" />
        <input value={aliases} onChange={e => setAliases(e.target.value)}
          placeholder="Apelidos" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={specialties} onChange={e => setSpecialties(e.target.value)}
          placeholder="Especialidades" className="w-full border rounded-lg px-3 py-2 text-sm" />
        <input value={gcal} onChange={e => setGcal(e.target.value)}
          placeholder="GCal ID" className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
        <ScheduleEditor value={schedule} onChange={setSchedule} />
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={pending}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
            {pending ? 'Salvando...' : 'Salvar'}
          </button>
          <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 rounded-lg border">
            Cancelar
          </button>
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
          <div className="text-xs text-gray-500 space-y-0.5">
            {activeDays.length > 0 ? (
              <>
                <p className="text-gray-400">Atende:</p>
                {activeDays.map(d => (
                  <p key={d}>{DAY_LABELS[d]}: {schedule[d]!.open}–{schedule[d]!.close}</p>
                ))}
              </>
            ) : (
              <p className="text-gray-300 italic">Horário geral do studio</p>
            )}
          </div>
          {prof.gcal_calendar_id && (
            <p className="text-xs text-gray-300 font-mono truncate">{prof.gcal_calendar_id}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">
            Editar
          </button>
          <button
            onClick={() => startTransition(() => toggleProfissional(tenantSlug, prof.id, !prof.active))}
            disabled={pending}
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              prof.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
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
