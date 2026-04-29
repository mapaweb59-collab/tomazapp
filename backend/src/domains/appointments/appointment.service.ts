import { createAppointment, findByIdempotencyKey } from './appointment.repository';
import { AppointmentRequest, Appointment } from './appointment.types';
import { createEvent, checkSlotAvailability } from '../../integrations/google-calendar';
import { checkEligibility } from '../../integrations/nexfit';
import { logAudit } from '../audit/audit.service';
import { reminderQueue } from '../../jobs/reminder.job';

export async function scheduleAppointment(req: AppointmentRequest): Promise<Appointment> {
  const existing = await findByIdempotencyKey(req.idempotencyKey);
  if (existing) return existing;

  const calendarId = req.professionalCalendarId ?? 'primary';
  const duration = req.durationMinutes ?? 60;

  const available = await checkSlotAvailability(req.requestedAt, duration, calendarId);
  if (!available) throw new Error('SLOT_UNAVAILABLE');

  const nexfitEligible = await checkEligibility(req.customerId);

  const gcalEvent = await createEvent({
    customerId: req.customerId,
    serviceType: req.serviceType,
    scheduledAt: req.requestedAt,
    durationMinutes: duration,
    calendarId,
    professionalName: req.professionalName,
  });

  const appointment = await createAppointment({
    customer_id: req.customerId,
    service_type: req.serviceType,
    scheduled_at: req.requestedAt,
    duration_minutes: duration,
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

  const reminderDelay = new Date(req.requestedAt).getTime() - 24 * 60 * 60 * 1000 - Date.now();
  if (reminderDelay > 0) {
    reminderQueue
      .add('appointment-reminder', { appointmentId: appointment.id }, {
        delay: reminderDelay,
        jobId: `reminder-${appointment.id}`,
      })
      .catch(() => {});
  }

  return appointment;
}
