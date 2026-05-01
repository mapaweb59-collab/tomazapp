ALTER TABLE rag_chunks
  ADD COLUMN IF NOT EXISTS source_page_id TEXT,
  ADD COLUMN IF NOT EXISTS source_title TEXT,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chunk_index INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE rag_chunks
  DROP CONSTRAINT IF EXISTS rag_chunks_source_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS rag_chunks_tenant_source_chunk_key
  ON rag_chunks (tenant_id, source_id, chunk_index);

CREATE INDEX IF NOT EXISTS rag_chunks_tenant_last_synced_idx
  ON rag_chunks (tenant_id, last_synced_at);
