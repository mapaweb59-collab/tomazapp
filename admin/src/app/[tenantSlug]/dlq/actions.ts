'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';

export async function replayOne(slug: string, id: string) {
  await api.post(`/admin/dlq/${id}/replay`);
  revalidatePath(`/${slug}/dlq`);
}

export async function replayAll(slug: string) {
  await api.post('/admin/dlq/replay-all');
  revalidatePath(`/${slug}/dlq`);
}

export async function discardOne(slug: string, id: string) {
  await api.patch(`/admin/dlq/${id}/discard`);
  revalidatePath(`/${slug}/dlq`);
}
