import { megaApi } from '../../../integrations/megaapi';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  // Endpoint configurável — verifique no painel MegaAPI qual path usar.
  // Ex: /rest/sendMessage/{key}  ou  /message/sendText/{key}
  const path = process.env.MEGAAPI_SEND_PATH
    ?? `/rest/sendMessage/${process.env.MEGAAPI_INSTANCE_KEY}`;

  const payload = { number: to, textMessage: { text } };
  console.log('[WA_SEND]', { path, to, payload });
  const { data } = await megaApi.post(path, payload);
  console.log('[WA_SEND_RESPONSE]', data);
}
