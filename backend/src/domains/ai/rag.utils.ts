export function shouldRetrieveRagContext(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (normalized.length < 8) return false;

  const acknowledgements = new Set([
    'ok',
    'okay',
    'sim',
    'ss',
    'valeu',
    'obrigado',
    'obrigada',
    'blz',
    'beleza',
    'certo',
    'tá',
    'ta',
    '👍',
  ]);

  return !acknowledgements.has(normalized);
}
