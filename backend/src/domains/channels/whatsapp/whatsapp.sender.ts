import { megaApi } from '../../../integrations/megaapi';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const path = `/rest/sendMessage/${process.env.MEGAAPI_INSTANCE_KEY}/text`;
  // MegaAPI espera o número com sufixo @s.whatsapp.net
  const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
  const payload = { messageData: { to: jid, text } };
  console.log('[WA_SEND]', { path, to: jid });
  const { data } = await megaApi.post(path, payload);
  console.log('[WA_SEND_RESPONSE]', data);
}
