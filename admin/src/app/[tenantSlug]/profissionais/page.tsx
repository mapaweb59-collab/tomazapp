export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { ProfissionaisClient } from './ProfissionaisClient';

interface Props { params: { tenantSlug: string } }

export default async function ProfissionaisPage({ params }: Props) {
  const supabase = createAdminClient();

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', params.tenantSlug)
    .single();

  const { data: professionals } = tenant
    ? await supabase
        .from('professionals')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('name')
    : { data: [] };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profissionais</h1>
      <ProfissionaisClient
        tenantSlug={params.tenantSlug}
        professionals={professionals ?? []}
      />
    </div>
  );
}
