import {
  createAppointment, findByIdempotencyKey, findById, findUpcomingByCustomer, updateStatus,
} from './appointment.repository';
import { AppointmentRequest, Appointment } from './appointment.types';
import { createEvent, deleteEvent, checkSlotAvailability } from '../../integrations/google-calendar';
import { checkEligibility } from '../../integrations/nexfit';
import { logAudit } from '../audit/audit.service';
import { reminderQueue } from '../../jobs/reminder.job';

export { findUpcomingByCustomer, findById };

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

export async function cancelAppointment(
  appointmentId: string,
  customerId: string,
  reason: string,
): Promise<Appointment> {
  const appointment = await findById(appointmentId);
  if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
  if (appointment.customer_id !== customerId) throw new Error('NOT_OWNER');
  if (appointment.status === 'cancelled') return appointment;

  if (appointment.gcal_event_id) {
    await deleteEvent(appointment.gcal_event_id).catch(err => {
      console.error('[CANCEL_GCAL_ERROR]', err);
    });
  }

  await updateStatus(appointmentId, 'cancelled');

  await logAudit({
    entity_type: 'appointment',
    entity_id: appointmentId,
    action: 'cancelled',
    actor: 'bot',
    before_state: appointment,
    after_state: { ...appointment, status: 'cancelled', reason },
  });

  return { ...appointment, status: 'cancelled' };
}

export async function rescheduleAppointment(
  appointmentId: string,
  customerId: string,
  newScheduledAt: string,           // ISO datetime
  options: { calendarId?: string; professionalName?: string } = {},
): Promise<Appointment> {
  const appointment = await findById(appointmentId);
  if (!appointment) throw new Error('APPOINTMENT_NOT_FOUND');
  if (appointment.customer_id !== customerId) throw new Error('NOT_OWNER');
  if (appointment.status === 'cancelled') throw new Error('ALREADY_CANCELLED');

  const calendarId = options.calendarId ?? 'primary';
  const duration = appointment.duration_minutes ?? 60;

  const available = await checkSlotAvailability(newScheduledAt, duration, calendarId);
  if (!available) throw new Error('SLOT_UNAVAILABLE');

  // Apaga o evento antigo, cria o novo
  if (appointment.gcal_event_id) {
    await deleteEvent(appointment.gcal_event_id).catch(err => {
      console.error('[RESCHEDULE_DELETE_ERROR]', err);
    });
  }

  const newEvent = await createEvent({
    customerId,
    serviceType: appointment.service_type,
    scheduledAt: newScheduledAt,
    durationMinutes: duration,
    calendarId,
    professionalName: options.professionalName,
  });

  await updateStatus(appointmentId, 'rescheduled', newEvent.id);

  // Atualiza o scheduled_at também
  const { error } = await (await import('../../lib/supabase')).supabase
    .from('appointments')
    .update({ scheduled_at: newScheduledAt, status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', appointmentId);
  if (error) throw error;

  await logAudit({
    entity_type: 'appointment',
    entity_id: appointmentId,
    action: 'rescheduled',
    actor: 'bot',
    before_state: appointment,
    after_state: { ...appointment, scheduled_at: newScheduledAt, gcal_event_id: newEvent.id },
  });

  return { ...appointment, scheduled_at: newScheduledAt, gcal_event_id: newEvent.id, status: 'confirmed' };
}
