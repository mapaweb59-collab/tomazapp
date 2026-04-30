import { megaApi } from '../../../integrations/megaapi';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const payload = { number: to, textMessage: { text } };
  console.log('[WA_SEND]', { to, payload });
  const { data } = await megaApi.post(
    `/rest/sendMessage/${process.env.MEGAAPI_TOKEN}`,
    payload,
  );
  console.log('[WA_SEND_RESPONSE]', data);
}
