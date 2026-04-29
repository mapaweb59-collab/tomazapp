'use server';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function toggleTenantActive(id: string, active: boolean) {
  const supabase = createAdminClient();
  await supabase.from('tenants').update({ active }).eq('id', id);
  revalidatePath('/admin/tenants');
}

export async function createTenant(formData: FormData) {
  const name = (formData.get('name') as string).trim();
  const slug = (formData.get('slug') as string)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  const plan = (formData.get('plan') as string) ?? 'basic';

  if (!name || !slug) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('tenants')
    .insert({ name, slug, plan, active: true });

  if (error) {
    redirect(`/admin/tenants/novo?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/${slug}/dashboard`);
}
