'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';

async function getTenantId(slug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  if (!data) throw new Error('Tenant not found');
  return data.id;
}

export async function createProfissional(slug: string, formData: FormData) {
  const tenantId = await getTenantId(slug);
  const name = formData.get('name') as string;
  const aliases = (formData.get('aliases') as string).split(',').map(s => s.trim()).filter(Boolean);
  const specialties = (formData.get('specialties') as string).split(',').map(s => s.trim()).filter(Boolean);
  const gcal = (formData.get('gcal_calendar_id') as string) || undefined;
  const businessHoursRaw = formData.get('business_hours') as string | null;
  const business_hours = businessHoursRaw ? JSON.parse(businessHoursRaw) : null;

  await api.post(`/api/tenants/${tenantId}/professionals`, {
    name, aliases, specialties, gcal_calendar_id: gcal, business_hours,
  });

  revalidatePath(`/${slug}/profissionais`);
}

export async function toggleProfissional(slug: string, id: string, active: boolean) {
  const tenantId = await getTenantId(slug);
  await api.patch(`/api/tenants/${tenantId}/professionals/${id}`, { active });
  revalidatePath(`/${slug}/profissionais`);
}

export async function updateProfissional(
  slug: string,
  id: string,
  data: {
    name: string;
    aliases: string[];
    specialties: string[];
    gcal_calendar_id?: string;
    business_hours?: Record<string, { open: string; close: string } | null>;
  },
) {
  const tenantId = await getTenantId(slug);
  await api.patch(`/api/tenants/${tenantId}/professionals/${id}`, data);
  revalidatePath(`/${slug}/profissionais`);
}
