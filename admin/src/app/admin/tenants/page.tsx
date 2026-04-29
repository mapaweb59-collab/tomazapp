export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import Link from 'next/link';
import { toggleTenantActive } from './actions';

export default async function AdminTenantsPage() {
  const supabase = createAdminClient();
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, plan, active, created_at')
    .order('created_at', { ascending: false });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Superadmin</p>
            <h1 className="text-2xl font-bold text-gray-900">Gerenciar Clientes</h1>
          </div>
          <Link
            href="/admin/tenants/novo"
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Novo cliente
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Slug</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Plano</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Criado em</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {(tenants ?? []).map(
                (t: {
                  id: string;
                  name: string;
                  slug: string;
                  plan: string;
                  active: boolean;
                  created_at: string;
                }) => {
                  const toggle = toggleTenantActive.bind(null, t.id, !t.active);
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{t.name}</td>
                      <td className="px-5 py-3 font-mono text-gray-500 text-xs">{t.slug}</td>
                      <td className="px-5 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                          {t.plan}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-5 py-3">
                        <form action={toggle}>
                          <button
                            type="submit"
                            className={`text-xs font-medium px-2 py-1 rounded-full cursor-pointer ${
                              t.active
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {t.active ? 'Ativo' : 'Inativo'}
                          </button>
                        </form>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/${t.slug}/dashboard`}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Painel →
                        </Link>
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>

          {(tenants ?? []).length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Nenhum cliente cadastrado.</div>
          )}
        </div>
      </div>
    </main>
  );
}
