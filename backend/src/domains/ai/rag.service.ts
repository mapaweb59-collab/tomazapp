import { openai } from '../../integrations/openai';
import { supabase } from '../../lib/supabase';
import { shouldRetrieveRagContext } from './rag.utils';
import { splitTextIntoChunks } from './rag.chunking';
import { getTenantConfigValue } from '../tenants/tenant.service';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_BATCH_SIZE = 96;
const MATCH_THRESHOLD = 0.35;
const MATCH_COUNT = 5;

export async function syncRagContentToVectors(tenantId: string): Promise<{ chunksSynced: number }> {
  const syncStartedAt = new Date().toISOString();
  const rawContent = await getTenantConfigValue(tenantId, 'rag.content');
  const chunks = splitTextIntoChunks(rawContent ?? '');

  for (let index = 0; index < chunks.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddingRes = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    const rows = batch.map((chunk, batchIndex) => ({
      tenant_id: tenantId,
      source_id: 'manual-rag-content',
      source_page_id: null,
      source_title: 'Conteudo RAG manual',
      source_updated_at: syncStartedAt,
      chunk_index: index + batchIndex,
      content: chunk,
      embedding: embeddingRes.data[batchIndex].embedding,
      updated_at: syncStartedAt,
      last_synced_at: syncStartedAt,
    }));

    const { error } = await supabase
      .from('rag_chunks')
      .upsert(rows, { onConflict: 'tenant_id,source_id,chunk_index' });

    if (error) {
      throw new Error(`Failed to upsert RAG chunks for tenant ${tenantId}: ${error.message}`);
    }
  }

  const { error: cleanupError } = await supabase
    .from('rag_chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .or(`last_synced_at.is.null,last_synced_at.lt.${syncStartedAt}`);

  if (cleanupError) {
    throw new Error(`Failed to clean stale RAG chunks for tenant ${tenantId}: ${cleanupError.message}`);
  }

  return { chunksSynced: chunks.length };
}

export async function retrieveContext(tenantId: string, query: string): Promise<string> {
  if (!shouldRetrieveRagContext(query)) return '';

  const embeddingRes = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });

  const embedding = embeddingRes.data[0].embedding;

  const { data, error } = await supabase.rpc('match_rag_chunks', {
    p_tenant_id: tenantId,
    query_embedding: embedding,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
  });

  if (error) {
    throw new Error(`Failed to retrieve RAG context for tenant ${tenantId}: ${error.message}`);
  }

  const hits = data ?? [];
  console.log('[RAG_RETRIEVE]', {
    query,
    hits: hits.length,
    topSimilarity: hits[0]?.similarity ?? null,
  });

  return hits.map((r: { content: string }) => r.content).join('\n\n');
}
