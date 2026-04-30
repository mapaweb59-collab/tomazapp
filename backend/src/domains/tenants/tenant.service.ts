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
    .select('id, name, aliases, specialties, gcal_calendar_id, business_hours')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  return (data ?? []).map(p => ({
    id: p.id,
    nome: p.name,
    apelidos: p.aliases as string[],
    especialidades: p.specialties as string[],
    gcalCalendarId: p.gcal_calendar_id ?? undefined,
    businessHours: (p.business_hours as Record<string, { open: string; close: string } | null> | null) ?? undefined,
  }));
}

export interface ServiceInfo {
  nome: string;
  preco: number;
  duracaoMin: number;
  requerHumano: boolean;
}

export async function loadServices(tenantId: string): Promise<ServiceInfo[]> {
  const { data } = await supabase
    .from('services')
    .select('name, price, duration_minutes, requires_handoff')
    .eq('tenant_id', tenantId)
    .eq('active', true);

  return (data ?? []).map(s => ({
    nome: s.name as string,
    preco: Number(s.price ?? 0),
    duracaoMin: Number(s.duration_minutes ?? 60),
    requerHumano: Boolean(s.requires_handoff),
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

export interface TenantScheduleConfig {
  durationMinutes: number;
  slotIntervalMinutes: number;
  // day key: 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun' → null = fechado
  businessHours: Record<string, { open: string; close: string } | null>;
  // calendário compartilhado do tenant (usado quando profissional não tem o próprio)
  sharedCalendarId: string;
}

function parseJsonbValue<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return null; }
  }
  return raw as T;
}

export async function getTenantScheduleConfig(tenantId: string): Promise<TenantScheduleConfig> {
  const { data: rows } = await supabase
    .from('tenant_config')
    .select('key, value')
    .eq('tenant_id', tenantId)
    .in('key', [
      'schedule.default_duration',
      'schedule.slot_interval',
      'schedule.business_hours',
      'gcal.calendar_id',
    ]);

  const cfg: Record<string, unknown> = {};
  for (const row of rows ?? []) cfg[row.key] = row.value;

  const businessHours = parseJsonbValue<Record<string, { open: string; close: string } | null>>(
    cfg['schedule.business_hours'],
  ) ?? {};

  const sharedCalendarId = typeof cfg['gcal.calendar_id'] === 'string'
    ? (cfg['gcal.calendar_id'] as string)
    : 'primary';

  console.log('[SCHEDULE_CONFIG]', {
    tenantId,
    sharedCalendarId,
    businessHoursKeys: Object.keys(businessHours),
    duration: cfg['schedule.default_duration'],
  });

  return {
    durationMinutes: Number(cfg['schedule.default_duration'] ?? 60),
    slotIntervalMinutes: Number(cfg['schedule.slot_interval'] ?? 60),
    businessHours,
    sharedCalendarId,
  };
}
