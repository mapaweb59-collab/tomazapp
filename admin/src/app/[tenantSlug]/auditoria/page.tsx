export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';

interface Props {
  params: { tenantSlug: string };
  searchParams: { page?: string; type?: string };
}

const ENTITY_COLORS: Record<string, string> = {
  appointment: 'bg-blue-100 text-blue-700',
  payment: 'bg-green-100 text-green-700',
  customer: 'bg-purple-100 text-purple-700',
  conversation: 'bg-orange-100 text-orange-700',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Criado',
  updated: 'Atualizado',
  cancelled: 'Cancelado',
  rescheduled: 'Reagendado',
  handoff: 'Handoff',
};

export default async function AuditoriaPage({ params, searchParams }: Props) {
  const supabase = createAdminClient();
  const page = Number(searchParams.page ?? 1);
  const pageSize = 50;
  const from = (page - 1) * pageSize;

  let q = supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (searchParams.type) q = q.eq('entity_type', searchParams.type);

  const { data: logs, count } = await q;
  const totalPages = Math.ceil((count ?? 0) / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Auditoria</h1>

        <div className="flex gap-2">
          {['', 'appointment', 'payment', 'customer', 'conversation'].map(type => (
            <a
              key={type}
              href={`/${params.tenantSlug}/auditoria${type ? `?type=${type}` : ''}`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                (searchParams.type ?? '') === type
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {type || 'Todos'}
            </a>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Tipo</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Ação</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Ator</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(logs ?? []).map((log: { id: string; entity_type: string; action: string; actor: string; created_at: string }) => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ENTITY_COLORS[log.entity_type] ?? 'bg-gray-100 text-gray-700'}`}>
                    {log.entity_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {ACTION_LABELS[log.action] ?? log.action}
                </td>
                <td className="px-4 py-3 text-gray-500">{log.actor}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(logs ?? []).length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">Nenhum registro encontrado.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <a
              key={p}
              href={`/${params.tenantSlug}/auditoria?page=${p}${searchParams.type ? `&type=${searchParams.type}` : ''}`}
              className={`w-8 h-8 flex items-center justify-center rounded text-sm ${
                p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
