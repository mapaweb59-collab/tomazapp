import { megaApi } from '../../../integrations/megaapi';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const payload = { number: to, textMessage: { text } };
  console.log('[WA_SEND]', { to, instance: process.env.MEGAAPI_INSTANCE_KEY, payload });
  const { data } = await megaApi.post(
    `/rest/sendMessage/${process.env.MEGAAPI_INSTANCE_KEY}`,
    payload,
  );
  console.log('[WA_SEND_RESPONSE]', data);
}
