import { google } from 'googleapis';

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth });

// UTC-3 (Brasília)
const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAYS_PT = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

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

export interface AvailableSlot {
  label: string;
  iso: string;
}

export async function listAvailableSlots(
  calendarId: string = 'primary',
  durationMinutes: number = 60,
  daysAhead: number = 7,
  businessHoursStart: number = 8,
  businessHoursEnd: number = 20,
  slotIntervalMinutes: number = 60,
  maxSlots: number = 5,
): Promise<AvailableSlot[]> {
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

  // Começa na próxima hora cheia a partir de agora (horário local)
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setTime(cursor.getTime() + 60 * 60 * 1000);

  // Ajusta para o início do horário comercial se necessário
  const localCursor = toLocal(cursor);
  if (localCursor.getUTCHours() < businessHoursStart) {
    cursor.setTime(cursor.getTime() + (businessHoursStart - localCursor.getUTCHours()) * 60 * 60 * 1000);
  }

  while (cursor < timeMax && slots.length < maxSlots) {
    const local = toLocal(cursor);
    const localHour = local.getUTCHours();

    // Pula finais de semana (0 = domingo, 6 = sábado)
    const localDay = local.getUTCDay();
    if (localDay === 0 || localDay === 6) {
      cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
      const nextLocal = toLocal(cursor);
      cursor.setTime(cursor.getTime() - nextLocal.getUTCHours() * 60 * 60 * 1000 - nextLocal.getUTCMinutes() * 60 * 1000);
      cursor.setTime(cursor.getTime() + businessHoursStart * 60 * 60 * 1000);
      continue;
    }

    if (localHour >= businessHoursEnd) {
      // Pula para o próximo dia
      cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
      const nextLocal = toLocal(cursor);
      cursor.setTime(cursor.getTime() - nextLocal.getUTCHours() * 60 * 60 * 1000 - nextLocal.getUTCMinutes() * 60 * 1000);
      cursor.setTime(cursor.getTime() + businessHoursStart * 60 * 60 * 1000);
      continue;
    }

    if (localHour >= businessHoursStart) {
      const slotStart = cursor.getTime();
      const slotEnd = slotStart + durationMinutes * 60 * 1000;
      const isBusy = busyPeriods.some(b => slotStart < b.end && slotEnd > b.start);

      if (!isBusy) {
        slots.push({
          label: formatSlotLabel(cursor),
          iso: cursor.toISOString(),
        });
      }
    }

    cursor.setTime(cursor.getTime() + slotIntervalMinutes * 60 * 1000);
  }

  return slots;
}

export function formatSlotsForPrompt(slots: AvailableSlot[]): string {
  if (!slots.length) return '';
  return slots
    .map((s, i) => `${i + 1}. ${s.label} → ${s.iso}`)
    .join('\n');
}

export async function checkSlotAvailability(startTime: string, calendarId = 'primary'): Promise<boolean> {
  const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime,
      timeMax: endTime,
      items: [{ id: calendarId }],
    },
  });

  const busy = data.calendars?.[calendarId]?.busy ?? [];
  return busy.length === 0;
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
  const endTime = new Date(new Date(params.scheduledAt).getTime() + duration * 60 * 1000).toISOString();

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
