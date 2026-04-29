import axios, { AxiosError } from 'axios';

const client = axios.create({
  baseURL: `${(process.env.CHATWOOT_API_URL ?? '').replace(/\/$/, '')}/api/v1`,
  headers: { api_access_token: process.env.CHATWOOT_API_KEY },
});

const accountId = () => Number(process.env.CHATWOOT_ACCOUNT_ID);
const inboxId = () => Number(process.env.CHATWOOT_INBOX_ID);

function logChatwootError(fn: string, err: unknown): never {
  const e = err as AxiosError;
  const detail = JSON.stringify(e.response?.data ?? e.message);
  console.error(`[chatwoot] ${fn} failed ${e.response?.status}: ${detail}`);
  throw err;
}

export async function sendMessage(conversationId: string, content: string): Promise<void> {
  await client.post(
    `/accounts/${accountId()}/conversations/${conversationId}/messages`,
    { content, message_type: 'outgoing', private: false },
  ).catch(e => logChatwootError('sendMessage', e));
}

export async function findOrCreateContact(phone: string, name?: string): Promise<string> {
  const searchRes = await client
    .get(`/accounts/${accountId()}/contacts/search`, {
      params: { q: phone, include_contacts: true },
    })
    .catch(e => logChatwootError('contacts/search', e));

  const contacts = searchRes.data?.payload?.contacts ?? searchRes.data?.payload ?? [];
  const existing = Array.isArray(contacts) ? contacts[0] : null;
  if (existing?.id) return String(existing.id);

  const createRes = await client
    .post(`/accounts/${accountId()}/contacts`, {
      phone_number: phone,
      name: name ?? phone,
    })
    .catch(e => logChatwootError('contacts/create', e));

  return String(createRes.data.id);
}

export async function createChatwootConversation(contactId: string): Promise<string> {
  const res = await client
    .post(`/accounts/${accountId()}/conversations`, {
      contact_id: Number(contactId),
      inbox_id: inboxId(),
    })
    .catch(e => logChatwootError('conversations/create', e));

  return String(res.data.id);
}

export async function assignAgent(conversationId: string): Promise<void> {
  await client
    .post(`/accounts/${accountId()}/conversations/${conversationId}/assignments`, {})
    .catch(() => {});
}
