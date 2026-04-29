import { normalizePhone } from '../../lib/phone';
import { upsertByPhone, findByPhone } from './customer.repository';
import { Customer, CustomerIdentity, ChannelType } from './customer.types';

export async function resolveIdentity(
  rawPhone: string,
  channel: ChannelType,
  name?: string,
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

  return {
    id: customer.id,
    isNew: !existing,
    phoneNormalized: customer.phone_normalized,
    name: customer.name,
    nexfitId: customer.nexfit_id ?? undefined,
  };
}
