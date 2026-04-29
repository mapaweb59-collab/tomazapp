import axios from 'axios';

const client = axios.create({
  baseURL: process.env.NEXFIT_API_URL,
  headers: { Authorization: `Bearer ${process.env.NEXFIT_API_KEY}` },
});

export async function checkEligibility(customerId: string): Promise<boolean> {
  try {
    const { data } = await client.get(`/members/${customerId}/eligibility`);
    return data.eligible === true;
  } catch {
    return false;
  }
}
