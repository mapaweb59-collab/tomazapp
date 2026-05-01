import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRetrieveRagContext } from './rag.utils';

test('should skip short messages and acknowledgements', () => {
  assert.equal(shouldRetrieveRagContext('ok'), false);
  assert.equal(shouldRetrieveRagContext('valeu'), false);
  assert.equal(shouldRetrieveRagContext('amanha'), false);
});

test('should retrieve context for meaningful messages', () => {
  assert.equal(shouldRetrieveRagContext('quais sao os planos da academia?'), true);
});
