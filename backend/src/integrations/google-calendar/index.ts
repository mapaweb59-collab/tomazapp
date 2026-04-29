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

export interface SlotsForDayResult {
  slots: AvailableSlot[];
  /** Data efetivamente usada (YYYY-MM-DD BRT). Pode diferir da solicitada se não havia vagas. */
  usedDate: string;
  /** True se não havia vagas no dia pedido e foi usado o próximo disponível. */
  wasFallback: boolean;
  /** Label legível da data usada, ex: "Segunda, 04/05" */
  usedDateLabel: string;
}

/**
 * Busca slots para um dia específico (YYYY-MM-DD em BRT).
 * Se não houver vagas naquele dia, avança até encontrar o próximo dia com vagas
 * (até maxFallbackDays dias à frente).
 */
export async function listSlotsForDay(
  targetDate: string,          // YYYY-MM-DD
  options: Omit<ListSlotsOptions, 'daysAhead' | 'maxSlots'> & { maxSlots?: number; maxFallbackDays?: number },
): Promise<SlotsForDayResult> {
  const {
    calendarId = 'primary',
    durationMinutes = 60,
    slotIntervalMinutes = 60,
    maxSlots = 5,
    maxFallbackDays = 14,
    businessHours = DEFAULT_BUSINESS_HOURS,
  } = options;

  // Janela de busca: começa no início do dia alvo, vai até maxFallbackDays além
  const [year, month, day] = targetDate.split('-').map(Number);
  // Meia-noite BRT do dia alvo em UTC
  const dayStartUtc = new Date(Date.UTC(year, month - 1, day, 3, 0, 0)); // 00:00 BRT = 03:00 UTC
  const searchEnd = new Date(dayStartUtc.getTime() + (maxFallbackDays + 1) * 24 * 60 * 60 * 1000);

  const now = new Date();
  // Se o dia alvo já passou, começa de agora
  const searchStart = dayStartUtc > now ? dayStartUtc : now;

  const { data } = await calendar.freebusy.query({
    requestBody: {
      timeMin: searchStart.toISOString(),
      timeMax: searchEnd.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busyPeriods = (data.calendars?.[calendarId]?.busy ?? []).map(b => ({
    start: new Date(b.start!).getTime(),
    end: new Date(b.end!).getTime(),
  }));

  // Percorre dia a dia a partir do targetDate
  let currentDayStart = new Date(searchStart);
  // Alinha para o início do dia correto em BRT
  {
    const local = toLocal(currentDayStart);
    local.setUTCHours(0, 0, 0, 0);
    currentDayStart = new Date(local.getTime() - TZ_OFFSET_MS);
    if (currentDayStart < searchStart) {
      // Já passou parte do dia — começa de agora mesmo
      currentDayStart = new Date(searchStart.getTime());
    }
  }

  let daysChecked = 0;

  while (daysChecked <= maxFallbackDays) {
    const localDay = toLocal(currentDayStart);
    const dayHours = getBusinessHoursForDay(localDay, businessHours);

    if (dayHours) {
      // Define cursor para a abertura deste dia
      const openUtc = new Date(currentDayStart);
      const localMidnight = toLocal(currentDayStart);
      localMidnight.setUTCHours(dayHours.openH, dayHours.openM, 0, 0);
      openUtc.setTime(localMidnight.getTime() - TZ_OFFSET_MS);

      // Se a abertura já passou, começa de agora (arredondado para o próximo intervalo)
      let cursor = openUtc > searchStart ? openUtc : new Date(searchStart.getTime());
      // Arredonda para o próximo intervalo
      const extra = cursor.getMinutes() % slotIntervalMinutes;
      if (extra !== 0) cursor.setMinutes(cursor.getMinutes() + (slotIntervalMinutes - extra), 0, 0);

      // Fechamento do dia
      const closeMidnight = toLocal(currentDayStart);
      closeMidnight.setUTCHours(dayHours.closeH, dayHours.closeM, 0, 0);
      const closeUtc = new Date(closeMidnight.getTime() - TZ_OFFSET_MS);
      const closeLimit = closeUtc.getTime() - durationMinutes * 60 * 1000;

      const daySlots: AvailableSlot[] = [];

      while (cursor.getTime() <= closeLimit && daySlots.length < maxSlots) {
        const slotStart = cursor.getTime();
        const slotEnd = slotStart + durationMinutes * 60 * 1000;
        const isBusy = busyPeriods.some(b => slotStart < b.end && slotEnd > b.start);

        if (!isBusy) {
          daySlots.push({ label: formatSlotLabel(cursor), iso: cursor.toISOString() });
        }
        cursor = new Date(cursor.getTime() + slotIntervalMinutes * 60 * 1000);
      }

      if (daySlots.length > 0) {
        const usedLocal = toLocal(currentDayStart);
        const usedDateStr = `${String(usedLocal.getUTCFullYear())}-${String(usedLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(usedLocal.getUTCDate()).padStart(2, '0')}`;
        const usedDateLabel = `${DAYS_PT[usedLocal.getUTCDay()]}, ${String(usedLocal.getUTCDate()).padStart(2, '0')}/${String(usedLocal.getUTCMonth() + 1).padStart(2, '0')}`;
        return {
          slots: daySlots,
          usedDate: usedDateStr,
          wasFallback: usedDateStr !== targetDate,
          usedDateLabel,
        };
      }
    }

    // Avança para o próximo dia
    const nextDayLocal = toLocal(currentDayStart);
    nextDayLocal.setUTCDate(nextDayLocal.getUTCDate() + 1);
    nextDayLocal.setUTCHours(0, 0, 0, 0);
    currentDayStart = new Date(nextDayLocal.getTime() - TZ_OFFSET_MS);
    daysChecked++;
  }

  // Nenhum slot encontrado em nenhum dia
  const usedLocal = toLocal(new Date(dayStartUtc));
  const usedDateLabel = `${DAYS_PT[usedLocal.getUTCDay()]}, ${String(usedLocal.getUTCDate()).padStart(2, '0')}/${String(usedLocal.getUTCMonth() + 1).padStart(2, '0')}`;
  return { slots: [], usedDate: targetDate, wasFallback: false, usedDateLabel };
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
