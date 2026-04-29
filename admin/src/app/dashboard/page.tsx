import { createAdminClient } from '../../lib/supabase/admin-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, active')
    .order('name');

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <Link
            href="/admin/tenants"
            className="text-sm text-blue-600 hover:underline"
          >
            Gerenciar →
          </Link>
        </div>

        <div className="grid gap-4">
          {(tenants ?? []).map((t: { id: string; name: string; slug: string; active: boolean }) => (
            <Link
              key={t.id}
              href={`/${t.slug}/dashboard`}
              className="flex items-center justify-between bg-white rounded-xl shadow-sm p-5 hover:shadow transition-shadow"
            >
              <div>
                <p className="font-semibold text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-400">{t.slug}</p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {t.active ? 'Ativo' : 'Inativo'}
              </span>
            </Link>
          ))}

          {(tenants ?? []).length === 0 && (
            <p className="text-gray-500 text-sm">Nenhum cliente cadastrado.</p>
          )}
        </div>
      </div>
    </main>
  );
}
