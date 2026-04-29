interface Props { params: { tenantSlug: string } }

export default function AuditoriaPage({ params }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Auditoria</h1>
      {/* AuditTable with filters and CSV export */}
    </div>
  );
}
