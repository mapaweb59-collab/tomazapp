import { supabase } from '../../lib/supabase';
import { Appointment, AppointmentStatus } from './appointment.types';

export async function createAppointment(data: Omit<Appointment, 'id' | 'created_at' | 'updated_at'>): Promise<Appointment> {
  const { data: appointment, error } = await supabase
    .from('appointments')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return appointment;
}

export async function findByIdempotencyKey(key: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('idempotency_key', key)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

export async function updateStatus(id: string, status: AppointmentStatus, gcalEventId?: string): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ status, gcal_event_id: gcalEventId, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function findById(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

export async function findUpcomingByCustomer(customerId: string): Promise<Appointment[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('customer_id', customerId)
    .in('status', ['confirmed', 'pending'])
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function acquireLock(id: string, durationMs: number): Promise<boolean> {
  const lockedUntil = new Date(Date.now() + durationMs).toISOString();
  const { error } = await supabase
    .from('appointments')
    .update({ locked_until: lockedUntil })
    .eq('id', id)
    .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`);

  return !error;
}
