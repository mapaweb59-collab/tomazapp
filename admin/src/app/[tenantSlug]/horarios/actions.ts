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

export async function saveHorarios(slug: string, formData: FormData) {
  const tenantId = await getTenantId(slug);

  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const businessHours: Record<string, { open: string; close: string } | null> = {};

  for (const day of days) {
    const enabled = formData.get(`${day}_enabled`) === 'on';
    if (enabled) {
      businessHours[day] = {
        open: formData.get(`${day}_open`) as string,
        close: formData.get(`${day}_close`) as string,
      };
    } else {
      businessHours[day] = null;
    }
  }

  await api.patch(`/api/tenants/${tenantId}/config`, {
    'schedule.business_hours': JSON.stringify(businessHours),
    'schedule.default_duration': formData.get('default_duration'),
    'schedule.slot_interval': formData.get('slot_interval'),
    'schedule.cancel_policy_hours': formData.get('cancel_policy_hours'),
    'schedule.reminder_hours': formData.get('reminder_hours'),
  });

  revalidatePath(`/${slug}/horarios`);
}
