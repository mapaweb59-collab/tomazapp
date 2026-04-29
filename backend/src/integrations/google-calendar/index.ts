import { google } from 'googleapis';

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth });

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
  professionalId?: string;
  calendarId?: string;
}): Promise<{ id: string }> {
  const endTime = new Date(new Date(params.scheduledAt).getTime() + 60 * 60 * 1000).toISOString();

  const { data } = await calendar.events.insert({
    calendarId: params.calendarId ?? 'primary',
    requestBody: {
      summary: params.serviceType,
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
