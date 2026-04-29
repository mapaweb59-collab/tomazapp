import { ChannelMessage } from '../../../types/channel-message';

interface MegaApiMessage {
  conversation?: string;
  extendedTextMessage?: { text: string };
  imageMessage?: { url: string; caption?: string };
  audioMessage?: { url: string };
  documentMessage?: { url: string; fileName?: string };
}

interface MegaApiPayload {
  key: { id: string; remoteJid: string; fromMe: boolean };
  message: MegaApiMessage;
  messageTimestamp: number;
}

function extractText(message: MegaApiMessage): string {
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    ''
  );
}

function extractMedia(
  message: MegaApiMessage,
): ChannelMessage['media'] | undefined {
  if (message.imageMessage) return { type: 'image', url: message.imageMessage.url };
  if (message.audioMessage) return { type: 'audio', url: message.audioMessage.url };
  if (message.documentMessage) return { type: 'document', url: message.documentMessage.url };
  return undefined;
}

export function normalizeMegaApiPayload(
  payload: MegaApiPayload,
): ChannelMessage | null {
  if (payload.key.fromMe) return null;

  const phone = payload.key.remoteJid.replace('@s.whatsapp.net', '');

  return {
    id: payload.key.id,
    channel: 'whatsapp',
    from: phone,
    text: extractText(payload.message),
    media: extractMedia(payload.message),
    timestamp: new Date(payload.messageTimestamp * 1000).toISOString(),
    raw: payload as unknown as Record<string, unknown>,
  };
}
