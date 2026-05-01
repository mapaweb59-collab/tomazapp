import { normalizePhone } from '../../lib/phone';
import { upsertByPhone, findByPhone } from './customer.repository';
import { Customer, CustomerIdentity, ChannelType } from './customer.types';
import { createLeadInNotionIfEnabled } from '../../integrations/notion';
import { logIncident } from '../incidents/incident.service';

export async function resolveIdentity(
  rawPhone: string,
  channel: ChannelType,
  name?: string,
  tenantId?: string,
): Promise<CustomerIdentity> {
  const phoneNormalized = normalizePhone(rawPhone);
  const existing = await findByPhone(phoneNormalized);

  const customer = await upsertByPhone(phoneNormalized, {
    channel_origin: existing ? existing.channel_origin : channel,
    name: name ?? existing?.name,
    external_ids: {
      ...(existing?.external_ids ?? {}),
      [channel]: rawPhone,
    },
  });

  const identity = {
    id: customer.id,
    isNew: !existing,
    phoneNormalized: customer.phone_normalized,
    name: customer.name,
    nexfitId: customer.nexfit_id ?? undefined,
  };

  if (!existing && tenantId) {
    await createLeadInNotionIfEnabled(tenantId, identity, channel).catch(async err => {
      await logIncident('medium', 'notion_lead_create_failed', err instanceof Error ? err.message : String(err), {
        tenantId,
        customerId: identity.id,
        channel,
      });
    });
  }

  return identity;
}
