export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';

interface Props { params: { tenantSlug: string } }

interface Metrics {
  conversations: number;
  appointments: number;
  handoffs: number;
  dlqPending: number;
  professionalsCount: number;
  lastRagSync?: string | null;
}

interface WaStatus {
  connected: boolean;
  disconnectedSince?: string | null;
  queueCount?: number;
}

async function getTenantId(slug: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  return data?.id ?? null;
}

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function ragAgo(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const mins = minutesSince(iso);
  if (mins === null) return 'nunca';
  if (mins < 2) return 'agora mesmo';
  if (mins < 60) return `${mins} min atrás`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h atrás`;
}

function StatCard({
  label, value, sub, href, warn,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col gap-3"
    >
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${warn && Number(value) > 0 ? 'text-red-500' : 'text-gray-900'}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
        Ver →
      </span>
    </Link>
  );
}

export default async function TenantDashboard({ params }: Props) {
  const tenantId = await getTenantId(params.tenantSlug);

  const [metrics, waStatus] = await Promise.all([
    tenantId
      ? api.get<Metrics>(`/api/tenants/${tenantId}/metrics`).catch((): Metrics => ({
          conversations: 0, appointments: 0, handoffs: 0,
          dlqPending: 0, professionalsCount: 0, lastRagSync: null,
        }))
      : ({ conversations: 0, appointments: 0, handoffs: 0, dlqPending: 0, professionalsCount: 0, lastRagSync: null } as Metrics),
    api.get<WaStatus>('/api/whatsapp/status').catch((): WaStatus => ({ connected: false })),
  ]);

  const waDisconnectedMins = minutesSince(waStatus.disconnectedSince);

  return (
    <div className="max-w-4xl space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Última sincronização RAG: <span className="text-gray-600">{ragAgo(metrics?.lastRagSync)}</span>
          </p>
        </div>
        <Link
          href={`/${params.tenantSlug}/integracoes`}
          className="text-xs text-blue-600 hover:underline"
        >
          Gerenciar integrações →
        </Link>
      </div>

      {/* WhatsApp banner */}
      {!waStatus.connected ? (
        <div className="bg-[#1a1a2e] rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
              <span className="text-orange-400 text-lg">⚡</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">WhatsApp desconectado</p>
              <p className="text-xs text-white/40 mt-0.5">
                {waDisconnectedMins !== null
                  ? `Desconectado há ${waDisconnectedMins}m`
                  : 'Status indisponível'}
                {waStatus.queueCount !== undefined && waStatus.queueCount > 0 && (
                  <span className="ml-2 bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded text-[10px]">
                    {waStatus.queueCount} em fila
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/${params.tenantSlug}/integracoes`}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
            >
              Ver integrações
            </Link>
            <Link
              href={`/${params.tenantSlug}/integracoes/whatsapp`}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors font-medium"
            >
              Reconectar
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-[#0d1f14] rounded-2xl p-4 flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
            <span className="text-green-400 text-sm">✓</span>
          </div>
          <p className="text-sm text-green-300 font-medium">WhatsApp conectado</p>
        </div>
      )}

      {/* Metric stat cards */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Hoje</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Conversas"
            value={metrics?.conversations ?? 0}
            href={`/${params.tenantSlug}/auditoria`}
          />
          <StatCard
            label="Agendamentos"
            value={metrics?.appointments ?? 0}
            href={`/${params.tenantSlug}/auditoria`}
          />
          <StatCard
            label="Handoffs"
            value={metrics?.handoffs ?? 0}
            href={`/${params.tenantSlug}/auditoria`}
          />
          <StatCard
            label="Erros na fila"
            value={metrics?.dlqPending ?? 0}
            href={`/${params.tenantSlug}/dlq`}
            warn
          />
        </div>
      </div>

      {/* Quick access */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Atalhos rápidos</p>
        <div className="grid grid-cols-2 gap-4">
          <Link
            href={`/${params.tenantSlug}/profissionais`}
            className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-gray-800">Profissionais</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {metrics?.professionalsCount ?? '—'} cadastrados
              </p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500 transition-colors text-lg">→</span>
          </Link>

          <Link
            href={`/${params.tenantSlug}/integracoes`}
            className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-gray-800">Integrações</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {waStatus.connected ? 'WhatsApp ativo' : 'Atenção necessária'}
              </p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500 transition-colors text-lg">→</span>
          </Link>

          <Link
            href={`/${params.tenantSlug}/dlq`}
            className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-gray-800">Fila de Erros</p>
              <p className={`text-xs mt-0.5 ${(metrics?.dlqPending ?? 0) > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {(metrics?.dlqPending ?? 0) > 0
                  ? `${metrics!.dlqPending} pendentes`
                  : 'Sem erros pendentes'}
              </p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500 transition-colors text-lg">→</span>
          </Link>

          <Link
            href={`/${params.tenantSlug}/auditoria`}
            className="group bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all flex items-center justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-gray-800">Auditoria</p>
              <p className="text-xs text-gray-400 mt-0.5">Log de todas as ações</p>
            </div>
            <span className="text-gray-300 group-hover:text-blue-500 transition-colors text-lg">→</span>
          </Link>
        </div>
      </div>

    </div>
  );
}
