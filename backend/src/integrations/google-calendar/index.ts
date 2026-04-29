import { google } from 'googleapis';
import { TenantScheduleConfig } from '../../domains/tenants/tenant.service';

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth });

// UTC-3 (Brasília) — fuso padrão. Usar Intl quando tenant tiver timezone próprio.
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function toLocal(utcDate: Date): Date {
  return new Date(utcDate.getTime() + TZ_OFFSET_MS);
}

function formatSlotLabel(utcDate: Date): string {
  const local = toLocal(utcDate);
  const dayName = DAYS_PT[local.getUTCDay()];
  const day = String(local.getUTCDate()).padStart(2, '0');
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const hour = String(local.getUTCHours()).padStart(2, '0');
  const min = local.getUTCMinutes();
  const minStr = min === 0 ? '' : String(min).padStart(2, '0');
  return `${dayName}, ${day}/${month} às ${hour}h${minStr}`;
}

// Fallback quando tenant não tem business_hours configurado
const DEFAULT_BUSINESS_HOURS: TenantScheduleConfig['businessHours'] = {
  mon: { open: '08:00', close: '20:00' },
  tue: { open: '08:00', close: '20:00' },
  wed: { open: '08:00', close: '20:00' },
  thu: { open: '08:00', close: '20:00' },
  fri: { open: '08:00', close: '20:00' },
  sat: null,
  sun: null,
};

function getBusinessHoursForDay(
  localDate: Date,
  businessHours: TenantScheduleConfig['businessHours'],
): { openH: number; openM: number; closeH: number; closeM: number } | null {
  const dayKey = DAY_KEYS[localDate.getUTCDay()];
  const hours = businessHours[dayKey] ?? null;
  if (!hours) return null;

  const [openH, openM] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  return { openH, openM, closeH, closeM };
}

export interface AvailableSlot {
  label: string;
  iso: string;
}

export interface ListSlotsOptions {
  calendarId?: string;
  durationMinutes?: number;
  daysAhead?: number;
  slotIntervalMinutes?: number;
  maxSlots?: number;
  businessHours?: TenantScheduleConfig['businessHours'];
}

export async function listAvailableSlots(options: ListSlotsOptions = {}): Promise<AvailableSlot[]> {
  const {
    calendarId = 'primary',
    durationMinutes = 60,
    daysAhead = 7,
    slotIntervalMinutes = 60,
    maxSlots = 5,
    businessHours = DEFAULT_BUSINESS_HOURS,
  } = options;

  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods = (data.calendars?.[calendarId]?.busy ?? []).map(b => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }));

  const slots: AvailableSlot[] = [];

  // Começa na próxima hora cheia (mínimo 30min no futuro)
  const cursor = new Date(now.getTime() + 30 * 60 * 1000);
  cursor.setMinutes(0, 0, 0);
  cursor.setTime(cursor.getTime() + slotIntervalMinutes * 60 * 1000);

  while (cursor < timeMax && slots.length < maxSlots) {
    const local = toLocal(cursor);
    const dayHours = getBusinessHoursForDay(local, businessHours);

    if (!dayHours) {
      // Dia fechado — pula para meia-noite do próximo dia (local) e continua
      const nextDay = new Date(local.getTime() + 24 * 60 * 60 * 1000);
      nextDay.setUTCHours(0, 0, 0, 0);
      cursor.setTime(nextDay.getTime() - TZ_OFFSET_MS);
      continue;
    }

    const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const openMinutes = dayHours.openH * 60 + dayHours.openM;
    const closeMinutes = dayHours.closeH * 60 + dayHours.closeM;

    if (localMinutes < openMinutes) {
      // Antes da abertura — avança para a abertura
      const diff = (openMinutes - localMinutes) * 60 * 1000;
      cursor.setTime(cursor.getTime() + diff);
      continue;
    }

    if (localMinutes >= closeMinutes - durationMinutes) {
      // Após o fechamento (ou slot não cabe) — pula para abertura do próximo dia
      const nextDay = new Date(local.getTime() + 24 * 60 * 60 * 1000);
      nextDay.setUTCHours(0, 0, 0, 0);
      cursor.setTime(nextDay.getTime() - TZ_OFFSET_MS);
      continue;
    }

    // Slot dentro do horário comercial — checa ocupação
    const slotStart = cursor.getTime();
    const slotEnd = slotStart + durationMinutes * 60 * 1000;
    const isBusy = busyPeriods.some(b => slotStart < b.end && slotEnd > b.start);

    if (!isBusy) {
      slots.push({ label: formatSlotLabel(cursor), iso: cursor.toISOString() });
    }

    cursor.setTime(cursor.getTime() + slotIntervalMinutes * 60 * 1000);
  }

  return slots;
}

export function formatSlotsForPrompt(slots: AvailableSlot[]): string {
  if (!slots.length) return '';
  return slots.map((s, i) => `${i + 1}. ${s.label} → ${s.iso}`).join('\n');
}

export async function checkSlotAvailability(
  startTime: string,
  durationMinutes: number,
  calendarId = 'primary',
): Promise<boolean> {
  const endTime = new Date(
    new Date(startTime).getTime() + durationMinutes * 60 * 1000,
  ).toISOString();

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime,
      timeMax: endTime,
      items: [{ id: calendarId }],
    },
  });

  return (data.calendars?.[calendarId]?.busy ?? []).length === 0;
}

export async function createEvent(params: {
  customerId: string;
  serviceType: string;
  scheduledAt: string;
  durationMinutes?: number;
  calendarId?: string;
  professionalName?: string;
}): Promise<{ id: string }> {
  const duration = params.durationMinutes ?? 60;
  const endTime = new Date(
    new Date(params.scheduledAt).getTime() + duration * 60 * 1000,
  ).toISOString();

  const { data } = await calendar.events.insert({
    calendarId: params.calendarId ?? 'primary',
    requestBody: {
      summary: `${params.serviceType}${params.professionalName ? ` — ${params.professionalName}` : ''}`,
      start: { dateTime: params.scheduledAt },
      end: { dateTime: endTime },
      extendedProperties: { private: { customerId: params.customerId } },
    },
  });

  return { id: data.id! };
}

export async function deleteEvent(eventId: string, calendarId = 'primary'): Promise<void> {
  await calendar.events.delete({ calendarId, eventId });
}
