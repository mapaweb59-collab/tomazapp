import axios from 'axios';

export const megaApi = axios.create({
  baseURL: process.env.MEGAAPI_HOST ?? 'https://api2.megaapi.com.br',
  headers: {
    Authorization: `Bearer ${process.env.MEGAAPI_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export async function getQrCode(): Promise<string> {
  const { data } = await megaApi.get(
    `/rest/instance/${process.env.MEGAAPI_INSTANCE_KEY}`,
  );
  return data.qrcode ?? '';
}

export async function getInstanceStatus(): Promise<boolean> {
  const { data } = await megaApi.get(
    `/rest/instance/${process.env.MEGAAPI_INSTANCE_KEY}`,
  );
  return data.instance_data?.phone_connected === true;
}
