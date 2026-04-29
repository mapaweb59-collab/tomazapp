import { supabase } from '../../lib/supabase';
import { Profissional } from '../ai/ai.types';

export async function getDefaultTenantId(): Promise<string> {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;

  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('active', true)
    .limit(1)
    .single();

  if (error || !data) throw new Error('No active tenant found. Set TENANT_ID env var.');
  return data.id;
}

export async function loadProfissionais(tenantId: string): Promise<Profissional[]> {
  const { data } = await supabase
    .from('professionals')
    .select('id, name, aliases, specialties, gcal_calendar_id')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  return (data ?? []).map(p => ({
    id: p.id,
    nome: p.name,
    apelidos: p.aliases as string[],
    especialidades: p.specialties as string[],
    gcalCalendarId: p.gcal_calendar_id ?? undefined,
  }));
}

export async function getServicePrice(tenantId: string, serviceName: string | null): Promise<number> {
  if (!serviceName) return 0;

  const { data } = await supabase
    .from('services')
    .select('price')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${serviceName}%`)
    .eq('active', true)
    .limit(1)
    .single();

  return (data?.price as number) ?? 0;
}

export async function getTenantConfigValue(
  tenantId: string,
  key: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('tenant_config')
    .select('value')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .single();

  return data?.value as string | undefined;
}
