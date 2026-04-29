interface Props { params: { tenantSlug: string } }

export default function IntegracoesPage({ params }: Props) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Integrações</h1>
      {/* WhatsAppCard, GoogleCalendarCard, AsaasCard, NexfitCard, ChatwootCard, TelegramCard */}
    </div>
  );
}
