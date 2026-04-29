import axios from 'axios';

const client = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: { apikey: process.env.EVOLUTION_API_KEY },
});

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await client.post(`/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
    number: to,
    text,
  });
}

export async function getQrCode(): Promise<string> {
  const { data } = await client.get(`/instance/connect/${process.env.EVOLUTION_INSTANCE}`);
  return data.qrcode?.base64 ?? '';
}

export async function getInstanceStatus(): Promise<string> {
  const { data } = await client.get(`/instance/connectionState/${process.env.EVOLUTION_INSTANCE}`);
  return data.instance?.state ?? 'unknown';
}
