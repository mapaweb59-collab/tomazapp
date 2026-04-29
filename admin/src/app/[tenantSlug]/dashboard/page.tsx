export const dynamic = 'force-dynamic';

import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';

interface Props { params: { tenantSlug: string } }

interface Metrics {
  conversations: number;
  appointments: number;
  handoffs: number;
  dlqPending: number;
}

interface WaStatus {
  connected: boolean;
}

async function getTenantId(slug: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id ?? null;
}

function MetricCard({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${warn && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}

export default async function TenantDashboard({ params }: Props) {
  const tenantId = await getTenantId(params.tenantSlug);

  const [metrics, waStatus] = await Promise.all([
    tenantId
      ? api.get<Metrics>(`/api/tenants/${tenantId}/metrics`).catch(() => null)
      : null,
    api.get<WaStatus>('/api/whatsapp/status').catch(() => ({ connected: false })),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Connection status banner */}
      {!waStatus.connected && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-red-500 text-xl">⚠️</span>
          <div>
            <p className="font-semibold text-red-700">WhatsApp desconectado</p>
            <p className="text-sm text-red-600">
              Acesse{' '}
              <a href={`/${params.tenantSlug}/integracoes`} className="underline">
                Integrações
              </a>{' '}
              para reconectar.
            </p>
          </div>
        </div>
      )}

      {waStatus.connected && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-green-500 text-xl">✅</span>
          <p className="font-semibold text-green-700">WhatsApp conectado</p>
        </div>
      )}

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard label="Conversas hoje" value={metrics.conversations} />
          <MetricCard label="Agendamentos hoje" value={metrics.appointments} />
          <MetricCard label="Handoffs hoje" value={metrics.handoffs} />
          <MetricCard label="Erros na fila" value={metrics.dlqPending} warn />
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Profissionais', href: 'profissionais' },
          { label: 'Integrações', href: 'integracoes' },
          { label: 'Fila de Erros', href: 'dlq' },
          { label: 'Auditoria', href: 'auditoria' },
        ].map(item => (
          <a
            key={item.href}
            href={`/${params.tenantSlug}/${item.href}`}
            className="bg-white rounded-xl shadow-sm p-5 hover:shadow transition-shadow text-sm font-medium text-gray-700"
          >
            {item.label} →
          </a>
        ))}
      </div>
    </div>
  );
}
