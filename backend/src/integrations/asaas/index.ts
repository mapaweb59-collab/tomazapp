import axios from 'axios';

const client = axios.create({
  baseURL: process.env.ASAAS_API_URL,
  headers: { access_token: process.env.ASAAS_API_KEY },
});

export async function createCharge(params: {
  customerId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const { data } = await client.post('/payments', {
    customer: params.customerId,
    billingType: 'UNDEFINED',
    value: params.amount,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    externalReference: params.idempotencyKey,
  });

  return { id: data.id };
}
