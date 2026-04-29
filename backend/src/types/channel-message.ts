export interface ChannelMessage {
  id: string;
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'site';
  from: string;
  text: string;
  media?: { type: string; url: string };
  timestamp: string;
  raw: Record<string, unknown>;
}
