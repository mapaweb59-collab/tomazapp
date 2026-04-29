interface Props { params: { tenantSlug: string } }

export default function TenantDashboard({ params }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard — {params.tenantSlug}</h1>
      {/* MetricsCards, StatusConnections, DLQBadge */}
    </div>
  );
}
