import axios from 'axios';

const client = axios.create({
  baseURL: `${(process.env.CHATWOOT_API_URL ?? '').replace(/\/$/, '')}/api/v1`,
  headers: { api_access_token: process.env.CHATWOOT_API_KEY },
});

const accountId = () => process.env.CHATWOOT_ACCOUNT_ID;
const inboxId = () => process.env.CHATWOOT_INBOX_ID;

export async function sendMessage(conversationId: string, content: string): Promise<void> {
  await client.post(
    `/accounts/${accountId()}/conversations/${conversationId}/messages`,
    { content, message_type: 'outgoing', private: false },
  );
}

export async function findOrCreateContact(phone: string, name?: string): Promise<string> {
  const searchRes = await client.get(
    `/accounts/${accountId()}/contacts/search`,
    { params: { q: phone, include_contacts: true } },
  );

  const existing = searchRes.data?.payload?.[0];
  if (existing?.id) return String(existing.id);

  const createRes = await client.post(`/accounts/${accountId()}/contacts`, {
    phone_number: phone,
    name: name ?? phone,
  });

  return String(createRes.data.id);
}

export async function createChatwootConversation(contactId: string): Promise<string> {
  const res = await client.post(`/accounts/${accountId()}/conversations`, {
    contact_id: contactId,
    inbox_id: inboxId(),
  });

  return String(res.data.id);
}

export async function assignAgent(conversationId: string): Promise<void> {
  await client.post(
    `/accounts/${accountId()}/conversations/${conversationId}/assignments`,
    {},
  ).catch(() => {
    // Silently ignore if no agents are available to assign
  });
}
