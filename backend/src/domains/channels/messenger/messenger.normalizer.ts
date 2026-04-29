import { ChannelMessage } from '../../../types/channel-message';

interface MetaMessagingEntry {
  id: string;
  messaging: Array<{
    sender: { id: string };
    timestamp: number;
    message: { mid: string; text?: string };
  }>;
}

export function normalizeMessengerPayload(entry: MetaMessagingEntry): ChannelMessage | null {
  const messaging = entry.messaging?.[0];
  if (!messaging?.message?.text) return null;

  return {
    id: messaging.message.mid,
    channel: 'messenger',
    from: messaging.sender.id,
    text: messaging.message.text,
    timestamp: new Date(messaging.timestamp).toISOString(),
    raw: entry as unknown as Record<string, unknown>,
  };
}
