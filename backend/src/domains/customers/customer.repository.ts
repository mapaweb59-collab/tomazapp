import { supabase } from '../../lib/supabase';
import { Customer } from './customer.types';

export async function upsertByPhone(phone: string, data: Partial<Customer>): Promise<Customer> {
  const { data: customer, error } = await supabase
    .from('customers')
    .upsert({ phone_normalized: phone, ...data }, { onConflict: 'phone_normalized' })
    .select()
    .single();

  if (error) throw error;
  return customer;
}

export async function findByPhone(phone: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('phone_normalized', phone)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

export async function findById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}
