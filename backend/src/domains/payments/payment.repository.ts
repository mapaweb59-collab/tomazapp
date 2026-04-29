import { supabase } from '../../lib/supabase';
import { Payment, PaymentStatus } from './payment.types';

export async function createPayment(data: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<Payment> {
  const { data: payment, error } = await supabase
    .from('payments')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return payment;
}

export async function updateStatusByAsaasId(asaasChargeId: string, status: PaymentStatus): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('asaas_charge_id', asaasChargeId);

  if (error) throw error;
}

export async function findByAsaasId(asaasChargeId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('asaas_charge_id', asaasChargeId)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

export async function findByIdempotencyKey(key: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('idempotency_key', key)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}
