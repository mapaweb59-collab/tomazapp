export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { createServico, toggleServico } from './actions';

interface Props { params: { tenantSlug: string } }

export default async function ServicosPage({ params }: Props) {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', params.tenantSlug).single();

  const { data: services } = tenant
    ? await supabase.from('services').select('*').eq('tenant_id', tenant.id).order('name')
    : { data: [] };

  const create = createServico.bind(null, params.tenantSlug);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Serviços</h1>

      <form action={create} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Novo serviço</h3>
        <div className="grid grid-cols-2 gap-3">
          <input name="name" required placeholder="Nome do serviço" className="border rounded-lg px-3 py-2 text-sm col-span-2" />
          <input name="price" type="number" step="0.01" placeholder="Preço (R$)" className="border rounded-lg px-3 py-2 text-sm" />
          <input name="duration_minutes" type="number" placeholder="Duração (min)" defaultValue={60} className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="requires_handoff" /> Requer atendimento humano
        </label>
        <button type="submit" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
          Adicionar
        </button>
      </form>

      <div className="space-y-3">
        {(services ?? []).map((s: { id: string; name: string; price: number; duration_minutes: number; requires_handoff: boolean; active: boolean }) => {
          const toggle = toggleServico.bind(null, params.tenantSlug, s.id, !s.active);
          return (
            <div key={s.id} className={`bg-white rounded-xl shadow-sm p-4 flex items-center justify-between ${!s.active ? 'opacity-50' : ''}`}>
              <div>
                <p className="font-medium text-gray-900">{s.name}</p>
                <p className="text-sm text-gray-500">
                  R$ {(s.price ?? 0).toFixed(2)} · {s.duration_minutes} min
                  {s.requires_handoff && ' · requer humano'}
                </p>
              </div>
              <form action={toggle}>
                <button type="submit" className={`text-xs px-2 py-1 rounded-full font-medium ${s.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.active ? 'Ativo' : 'Inativo'}
                </button>
              </form>
            </div>
          );
        })}
        {(services ?? []).length === 0 && <p className="text-gray-500 text-sm">Nenhum serviço cadastrado.</p>}
      </div>
    </div>
  );
}
