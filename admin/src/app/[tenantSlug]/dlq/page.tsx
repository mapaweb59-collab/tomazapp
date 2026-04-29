interface Props { params: { tenantSlug: string } }

export default function DLQPage({ params }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fila de Erros</h1>
      {/* DLQTable with replay/discard actions */}
    </div>
  );
}
