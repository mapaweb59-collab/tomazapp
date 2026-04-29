export interface CustomerIdentity {
  id: string;
  isNew: boolean;
  phoneNormalized: string;
  name?: string;
  nexfitId?: string;
}

export interface Customer {
  id: string;
  phone_normalized: string;
  email?: string;
  name?: string;
  channel_origin: ChannelType;
  external_ids: Record<string, string>;
  nexfit_id?: string;
  created_at: string;
  updated_at: string;
}

export type ChannelType = 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'site';
