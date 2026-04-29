import { createAppointment, findByIdempotencyKey } from './appointment.repository';
import { AppointmentRequest, Appointment } from './appointment.types';
import { createEvent, checkSlotAvailability } from '../../integrations/google-calendar';
import { checkEligibility } from '../../integrations/nexfit';
import { logAudit } from '../audit/audit.service';

export async function scheduleAppointment(req: AppointmentRequest): Promise<Appointment> {
  const existing = await findByIdempotencyKey(req.idempotencyKey);
  if (existing) return existing;

  const available = await checkSlotAvailability(req.requestedAt, req.professionalId);
  if (!available) throw new Error('SLOT_UNAVAILABLE');

  const nexfitEligible = await checkEligibility(req.customerId);

  const gcalEvent = await createEvent({
    customerId: req.customerId,
    serviceType: req.serviceType,
    scheduledAt: req.requestedAt,
    professionalId: req.professionalId,
  });

  const appointment = await createAppointment({
    customer_id: req.customerId,
    service_type: req.serviceType,
    scheduled_at: req.requestedAt,
    duration_minutes: 60,
    status: 'confirmed',
    gcal_event_id: gcalEvent.id,
    nexfit_eligible: nexfitEligible,
    idempotency_key: req.idempotencyKey,
  });

  await logAudit({
    entity_type: 'appointment',
    entity_id: appointment.id,
    action: 'created',
    actor: 'bot',
    after_state: appointment,
  });

  return appointment;
}
