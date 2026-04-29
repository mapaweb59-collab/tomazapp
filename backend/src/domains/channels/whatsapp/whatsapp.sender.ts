import { megaApi } from '../../../integrations/megaapi';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  await megaApi.post(
    `/rest/sendMessage/${process.env.MEGAAPI_INSTANCE_KEY}`,
    { number: to, textMessage: { text } },
  );
}
