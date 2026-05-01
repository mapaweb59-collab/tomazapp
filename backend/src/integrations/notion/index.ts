import { Client } from '@notionhq/client';
import { getTenantConfigValue } from '../../domains/tenants/tenant.service';
import { CustomerIdentity, ChannelType } from '../../domains/customers/customer.types';

interface NotionLeadConfig {
  enabled: boolean;
  token?: string;
  databaseId?: string;
}

async function getNotionLeadConfig(tenantId: string): Promise<NotionLeadConfig> {
  const [enabled, token, databaseId] = await Promise.all([
    getTenantConfigValue(tenantId, 'notion.leads_enabled'),
    getTenantConfigValue(tenantId, 'notion.token'),
    getTenantConfigValue(tenantId, 'notion.leads_database_id'),
  ]);

  return {
    enabled: enabled === 'true' || (enabled as unknown) === true,
    token,
    databaseId,
  };
}

export async function createLeadInNotionIfEnabled(
  tenantId: string,
  lead: CustomerIdentity,
  channel: ChannelType,
): Promise<void> {
  const config = await getNotionLeadConfig(tenantId);
  if (!config.enabled || !config.token || !config.databaseId) return;

  const notion = new Client({ auth: config.token });
  const title = lead.name ?? lead.phoneNormalized;

  await notion.pages.create({
    parent: { database_id: config.databaseId },
    properties: {
      Nome: {
        title: [{ text: { content: title } }],
      },
      Telefone: {
        rich_text: [{ text: { content: lead.phoneNormalized } }],
      },
      Canal: {
        select: { name: channel },
      },
      Origem: {
        rich_text: [{ text: { content: 'AtendenteTomaz' } }],
      },
      Criado: {
        date: { start: new Date().toISOString() },
      },
    },
  } as Parameters<typeof notion.pages.create>[0]);
}
