import { SidebarNav } from '../../components/layout/SidebarNav';
import { createAdminClient } from '../../lib/supabase/admin-client';

interface Props {
  children: React.ReactNode;
  params: { tenantSlug: string };
}

async function getTenantMeta(slug: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('tenants')
    .select('name, plan')
    .eq('slug', slug)
    .single();
  return data;
}

export default async function TenantLayout({ children, params }: Props) {
  const meta = await getTenantMeta(params.tenantSlug).catch(() => null);
  const planLabel = meta?.plan === 'pro'
    ? 'Pro · até 2026'
    : meta?.plan === 'enterprise'
    ? 'Enterprise'
    : 'Basic';

  return (
    <div className="flex min-h-screen bg-[#f5f6fa]">
      <SidebarNav
        tenantSlug={params.tenantSlug}
        tenantName={meta?.name}
        tenantPlan={planLabel}
      />
      <main className="flex-1 p-7 overflow-auto min-w-0">{children}</main>
    </div>
  );
}
