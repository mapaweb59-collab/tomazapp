interface Props { params: { tenantSlug: string } }

export default function ProfissionaisPage({ params }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profissionais</h1>
        {/* AddProfessionalButton */}
      </div>
      {/* ProfessionalsList */}
    </div>
  );
}
