-- Horários de atendimento por profissional
-- Formato: { "mon": {"open":"08:00","close":"12:00"}, "tue": null, ... }
-- null = dia fechado para este profissional

ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT NULL;

COMMENT ON COLUMN professionals.business_hours IS
  'Horários de atendimento do profissional por dia da semana. '
  'null = usa o horário geral do tenant. '
  'Chaves: mon|tue|wed|thu|fri|sat|sun. '
  'Valor null para o dia = fechado.';
