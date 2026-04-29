export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'rescheduled';

export interface AppointmentRequest {
  customerId: string;
  serviceType: string;
  requestedAt: string;
  idempotencyKey: string;
  durationMinutes?: number;
  professionalCalendarId?: string; // calendário próprio do profissional ou compartilhado
  professionalName?: string;
}

export interface Appointment {
  id: string;
  customer_id: string;
  service_type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  gcal_event_id?: string;
  nexfit_eligible?: boolean;
  idempotency_key: string;
  locked_until?: string;
  created_at: string;
  updated_at: string;
}
