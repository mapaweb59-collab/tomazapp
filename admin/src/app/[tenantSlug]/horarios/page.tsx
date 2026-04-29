export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { saveHorarios } from './actions';

interface Props { params: { tenantSlug: string } }

const DAY_LABELS: Record<string, string> = {
  mon: 'Segunda', tue: 'Terça', wed: 'Quarta',
  thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo',
};

export default async function HorariosPage({ params }: Props) {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', params.tenantSlug).single();

  const { data: rows } = tenant
    ? await supabase.from('tenant_config').select('key, value').eq('tenant_id', tenant.id)
    : { data: [] };

  const cfg: Record<string, string> = {};
  for (const row of rows ?? []) cfg[row.key] = row.value as string;

  const bh = cfg['schedule.business_hours']
    ? (JSON.parse(cfg['schedule.business_hours']) as Record<string, { open: string; close: string } | null>)
    : {};

  const save = saveHorarios.bind(null, params.tenantSlug);

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-gray-900">Horários de Funcionamento</h1>

      <form action={save} className="space-y-5">
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Dias e horários</h2>
          {Object.entries(DAY_LABELS).map(([day, label]) => {
            const dayConfig = bh[day];
            return (
              <div key={day} className="flex items-center gap-4">
                <label className="flex items-center gap-2 w-28">
                  <input
                    type="checkbox"
                    name={`${day}_enabled`}
                    defaultChecked={!!dayConfig}
                  />
                  <span className="text-sm">{label}</span>
                </label>
                <input
                  type="time"
                  name={`${day}_open`}
                  defaultValue={dayConfig?.open ?? '08:00'}
                  className="border rounded px-2 py-1 text-sm w-28"
                />
                <span className="text-gray-400 text-sm">até</span>
                <input
                  type="time"
                  name={`${day}_close`}
                  defaultValue={dayConfig?.close ?? '20:00'}
                  className="border rounded px-2 py-1 text-sm w-28"
                />
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duração padrão (min)</label>
            <input type="number" name="default_duration" defaultValue={cfg['schedule.default_duration'] ?? '60'} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intervalo entre slots (min)</label>
            <input type="number" name="slot_interval" defaultValue={cfg['schedule.slot_interval'] ?? '60'} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horas mín. para cancelar</label>
            <input type="number" name="cancel_policy_hours" defaultValue={cfg['schedule.cancel_policy_hours'] ?? '24'} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lembrete (horas antes, 0 = off)</label>
            <input type="number" name="reminder_hours" defaultValue={cfg['schedule.reminder_hours'] ?? '24'} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <button type="submit" className="bg-blue-600 text-white text-sm px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          Salvar
        </button>
      </form>
    </div>
  );
}
