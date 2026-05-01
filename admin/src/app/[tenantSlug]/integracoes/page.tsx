export const dynamic = 'force-dynamic';

import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';
import { revalidatePath } from 'next/cache';
import { PaymentToggle } from './PaymentToggle';

interface Props { params: { tenantSlug: string } }

interface WaStatus { connected: boolean; qrcode?: string }

async function reconnect(slug: string) {
  'use server';
  await api.post('/api/whatsapp/reconnect');
  revalidatePath(`/${slug}/integracoes`);
}

async function setPaymentEnabled(tenantId: string, slug: string, formData: FormData) {
  'use server';
  const enabled = formData.get('enabled') === 'on';
  await api.patch(`/api/tenants/${tenantId}/config`, { 'payment.enabled': enabled });
  revalidatePath(`/${slug}/integracoes`);
}

async function saveNotionLeadConfig(tenantId: string, slug: string, formData: FormData) {
  'use server';
  const token = String(formData.get('notion_token') ?? '').trim();
  const databaseId = String(formData.get('notion_leads_database_id') ?? '').trim();

  const config: Record<string, string | boolean> = {
    'notion.leads_enabled': formData.get('notion_leads_enabled') === 'on',
    'notion.leads_database_id': databaseId,
  };

  if (token) config['notion.token'] = token;

  await api.patch(`/api/tenants/${tenantId}/config`, config);
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
  const paymentEnabled = cfg['payment.enabled'] === 'true' || (cfg['payment.enabled'] as unknown) === true;
  const togglePaymentAction = tenant ? setPaymentEnabled.bind(null, tenant.id, params.tenantSlug) : null;
  const notionLeadsEnabled = cfg['notion.leads_enabled'] === 'true' || (cfg['notion.leads_enabled'] as unknown) === true;
  const notionLeadAction = tenant ? saveNotionLeadConfig.bind(null, tenant.id, params.tenantSlug) : null;

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

          {togglePaymentAction && (
            <PaymentToggle enabled={paymentEnabled} action={togglePaymentAction} />
          )}
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

        {/* Notion Leads */}
        <IntegrationCard title="Notion (Leads)">
          <div className="flex items-center justify-between">
            <StatusBadge ok={notionLeadsEnabled && !!cfg['notion.token'] && !!cfg['notion.leads_database_id']} />
            <span className="text-xs text-gray-400">
              {notionLeadsEnabled ? 'Ativo' : 'Opcional'}
            </span>
          </div>

          {notionLeadAction && (
            <form action={notionLeadAction} className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="notion_leads_enabled"
                  defaultChecked={notionLeadsEnabled}
                  className="rounded border-gray-300"
                />
                Criar lead no Notion quando um contato novo entrar
              </label>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Token da integração</label>
                <input
                  name="notion_token"
                  type="password"
                  placeholder={cfg['notion.token'] ? 'Token já configurado' : 'secret_...'}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Database ID de leads</label>
                <input
                  name="notion_leads_database_id"
                  defaultValue={cfg['notion.leads_database_id'] ?? ''}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                />
              </div>

              <button type="submit" className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
                Salvar Notion
              </button>
            </form>
          )}
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
