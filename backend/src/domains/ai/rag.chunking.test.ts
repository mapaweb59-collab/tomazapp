import assert from 'node:assert/strict';
import test from 'node:test';
import { splitTextIntoChunks } from './rag.chunking';

test('splitTextIntoChunks keeps short text as a single chunk', () => {
  assert.deepEqual(splitTextIntoChunks('Pergunta frequente curta.'), ['Pergunta frequente curta.']);
});

test('splitTextIntoChunks returns no chunks for empty text', () => {
  assert.deepEqual(splitTextIntoChunks('   '), []);
});

test('splitTextIntoChunks splits long text with overlap', () => {
  const text = Array.from({ length: 140 }, (_, index) => `Paragrafo ${index} com conteudo de FAQ para testar chunking.`).join('\n\n');
  const chunks = splitTextIntoChunks(text);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length <= 3500));
  assert.ok(chunks[1].includes('FAQ para testar chunking'));
});
