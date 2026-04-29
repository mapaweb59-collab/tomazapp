export const dynamic = 'force-dynamic';

import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';
import { revalidatePath } from 'next/cache';

interface Props { params: { tenantSlug: string } }

interface WaStatus { connected: boolean; qrcode?: string }

async function reconnect(slug: string) {
  'use server';
  await api.post('/api/whatsapp/reconnect');
  revalidatePath(`/${slug}/integracoes`);
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? 'Conectado' : 'Desconectado'}
    </span>
  );
}

function IntegrationCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

export default async function IntegracoesPage({ params }: Props) {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', params.tenantSlug).single();

  const { data: rows } = tenant
    ? await supabase.from('tenant_config').select('key, value').eq('tenant_id', tenant.id)
    : { data: [] };

  const cfg: Record<string, string> = {};
  for (const row of rows ?? []) cfg[row.key] = row.value as string;

  const waStatus = await api.get<WaStatus>('/api/whatsapp/status').catch((): WaStatus => ({ connected: false }));

  const reconnectAction = reconnect.bind(null, params.tenantSlug);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Integrações</h1>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* WhatsApp */}
        <IntegrationCard title="WhatsApp (Mega API)">
          <div className="flex items-center justify-between">
            <StatusBadge ok={waStatus.connected} />
            {!waStatus.connected && (
              <form action={reconnectAction}>
                <button type="submit" className="text-sm bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700">
                  Solicitar QR
                </button>
              </form>
            )}
          </div>

          {waStatus.qrcode && !waStatus.connected && (
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-500 mb-2">Escaneie com o WhatsApp para reconectar</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={waStatus.qrcode}
                alt="QR Code WhatsApp"
                className="mx-auto w-48 h-48 rounded"
              />
            </div>
          )}

          <div className="text-xs text-gray-400 space-y-1">
            <p>Instância: <span className="font-mono">{process.env.MEGAAPI_INSTANCE_KEY ?? '—'}</span></p>
          </div>
        </IntegrationCard>

        {/* Google Calendar */}
        <IntegrationCard title="Google Calendar">
          <div className="flex items-center justify-between">
            <StatusBadge ok={!!cfg['gcal.account']} />
          </div>
          <p className="text-sm text-gray-500">
            {cfg['gcal.account'] ? `Conta: ${cfg['gcal.account']}` : 'Não configurado'}
          </p>
          <p className="text-xs text-gray-400">Configure GOOGLE_REFRESH_TOKEN no ambiente do servidor.</p>
        </IntegrationCard>

        {/* Asaas */}
        <IntegrationCard title="Asaas (Pagamentos)">
          <div className="flex items-center justify-between">
            <StatusBadge ok={!!cfg['asaas.api_key']} />
            <span className="text-xs text-gray-400">
              {cfg['asaas.environment'] === 'production' ? 'Produção' : 'Sandbox'}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            API Key: {cfg['asaas.api_key'] ? '••••••••' + cfg['asaas.api_key'].slice(-4) : 'Não configurado'}
          </p>
        </IntegrationCard>

        {/* Nexfit */}
        <IntegrationCard title="Nexfit (Elegibilidade)">
          <div className="flex items-center justify-between">
            <StatusBadge ok={!!cfg['nexfit.api_key']} />
          </div>
          <p className="text-sm text-gray-500">
            {cfg['nexfit.api_key'] ? 'API Key configurada' : 'Não configurado'}
          </p>
        </IntegrationCard>

        {/* Chatwoot */}
        <IntegrationCard title="Chatwoot (Handoff)">
          <p className="text-sm text-gray-500">
            URL: {process.env.CHATWOOT_API_URL ? process.env.CHATWOOT_API_URL.replace(/https?:\/\//, '') : '—'}
          </p>
          <p className="text-xs text-gray-400">Configure via variáveis de ambiente no servidor.</p>
        </IntegrationCard>

        {/* Telegram */}
        <IntegrationCard title="Telegram (Alertas)">
          <StatusBadge ok={!!(cfg['telegram.bot_token'] || process.env.TELEGRAM_BOT_TOKEN)} />
          <p className="text-xs text-gray-400">Configure TELEGRAM_BOT_TOKEN e TELEGRAM_ALERT_CHAT_ID no servidor.</p>
        </IntegrationCard>
      </div>
    </div>
  );
}
