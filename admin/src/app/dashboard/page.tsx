import { createAdminClient } from '../../lib/supabase/admin-client';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createAdminClient();
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, plan, active')
    .order('name');

  const list = (tenants ?? []) as { id: string; name: string; slug: string; plan: string; active: boolean }[];

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Top bar */}
      <header className="px-8 py-5 border-b border-white/5 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Hub Omnichannel</p>
        <Link
          href="/admin/tenants/novo"
          className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors font-medium"
        >
          + Novo cliente
        </Link>
      </header>

      <main className="flex-1 px-8 py-10 max-w-3xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">Clientes</h1>
          <Link href="/admin/tenants" className="text-xs text-white/40 hover:text-white/70 transition-colors">
            Gerenciar →
          </Link>
        </div>

        <div className="space-y-2">
          {list.map(t => (
            <Link
              key={t.id}
              href={`/${t.slug}/dashboard`}
              className="flex items-center justify-between bg-white/5 hover:bg-white/8 border border-white/5 rounded-2xl px-5 py-4 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-300 font-bold text-sm">
                  {t.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-xs text-white/30">{t.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  t.active
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-white/5 text-white/30'
                }`}>
                  {t.active ? 'Ativo' : 'Inativo'}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 capitalize">
                  {t.plan ?? 'basic'}
                </span>
                <span className="text-white/20 group-hover:text-white/50 transition-colors">→</span>
              </div>
            </Link>
          ))}

          {list.length === 0 && (
            <div className="text-center py-16">
              <p className="text-white/30 text-sm">Nenhum cliente cadastrado ainda.</p>
              <Link
                href="/admin/tenants/novo"
                className="mt-4 inline-block text-xs px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
              >
                Criar primeiro cliente
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
