import { SidebarNav } from '../../components/layout/SidebarNav';

interface Props {
  children: React.ReactNode;
  params: { tenantSlug: string };
}

export default function TenantLayout({ children, params }: Props) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav tenantSlug={params.tenantSlug} />
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}
