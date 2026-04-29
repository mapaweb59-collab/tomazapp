import { getNotionChunks } from '../../integrations/notion';
import { openai } from '../../integrations/openai';
import { supabase } from '../../lib/supabase';

export async function syncNotionToVectors(tenantId: string): Promise<void> {
  const chunks = await getNotionChunks(tenantId);

  for (const chunk of chunks) {
    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: chunk.text,
    });

    const embedding = embeddingRes.data[0].embedding;

    await supabase.from('rag_chunks').upsert({
      tenant_id: tenantId,
      source_id: chunk.id,
      content: chunk.text,
      embedding,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source_id' });
  }
}

export async function retrieveContext(tenantId: string, query: string): Promise<string> {
  const embeddingRes = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });

  const embedding = embeddingRes.data[0].embedding;

  const { data } = await supabase.rpc('match_rag_chunks', {
    p_tenant_id: tenantId,
    query_embedding: embedding,
    match_threshold: 0.75,
    match_count: 5,
  });

  return (data ?? []).map((r: { content: string }) => r.content).join('\n\n');
}
