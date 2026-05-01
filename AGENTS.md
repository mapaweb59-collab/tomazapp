# Contexto do Projeto — Hub Omnichannel com IA

## Visão Geral

Este projeto é um hub de automação omnichannel com IA para academias/studios fitness.
O sistema conecta múltiplos canais de comunicação (WhatsApp, Instagram, Messenger, TikTok, Site)
a um motor de IA com RAG, motor de agenda, pagamentos e auditoria completa.

## Objetivo

Construir um sistema que permita ao cliente final:
- Conversar com um bot inteligente por qualquer canal
- Agendar, reagendar e cancelar aulas/sessões
- Receber cobranças e confirmar pagamentos
- Ter handoff transparente para atendimento humano

---

## Stack Técnica

| Camada              | Tecnologia                                         |
|---------------------|----------------------------------------------------|
| Backend/API         | Node.js com Fastify (ou Python com FastAPI)        |
| Orquestração de IA  | LangChain ou LlamaIndex                            |
| LLM principal       | GPT-4o mini (fluxos simples) / GPT-4o (complexos) |
| Embeddings (RAG)    | text-embedding-3-small (OpenAI)                    |
| RAG fonte           | Notion API + pgvector (Supabase)                   |
| Banco principal     | Supabase (PostgreSQL)                              |
| Fila / DLQ          | BullMQ (Redis) + tabela DLQ no Supabase            |
| WhatsApp            | Evolution API (self-hosted) → Chatwoot             |
| Multi-canal         | Chatwoot (orquestrador de conversas)               |
| Agenda              | Google Calendar API (sync bidirecional)            |
| Elegibilidade       | Nexfit API                                         |
| Pagamento           | Asaas API                                          |
| Alertas             | Telegram Bot API + e-mail + Chatwoot interno       |
| Monitoramento       | Uptime + logs estruturados no Supabase             |

---

## Arquitetura Geral

```
Canais de entrada (WA, IG, TikTok, Site, Messenger)
        ↓
   Chatwoot (orquestrador de conversas e handoff)
        ↓
  Gateway de entrada (normalização de payload → ChannelMessage)
        ↓
  Motor de IA (LLM + RAG Notion + histórico de conversa)
        ↓
  Roteador de intenções
    ├── Agenda (Google Calendar + Nexfit)
    ├── Pagamento (Asaas)
    ├── FAQ/RAG (Notion)
    └── Handoff humano (Chatwoot agent)
        ↓
  Serviços internos (identidade, locks, idempotência)
        ↓
  Auditoria / DLQ (Supabase)
        ↓
  Alertas (Telegram / e-mail / Chatwoot interno)
```

---

## Schema do Banco de Dados (Supabase / PostgreSQL)

### customers
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized TEXT UNIQUE NOT NULL,  -- chave de identidade principal
  email TEXT,
  name TEXT,
  channel_origin TEXT,  -- 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'site'
  external_ids JSONB DEFAULT '{}',  -- { "whatsapp": "...", "instagram": "..." }
  nexfit_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### conversations
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  channel TEXT NOT NULL,
  chatwoot_conversation_id TEXT,
  status TEXT DEFAULT 'bot',  -- 'bot' | 'human' | 'closed'
  context JSONB DEFAULT '{}', -- estado atual da conversa
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  channel TEXT,
  idempotency_key TEXT UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### appointments
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  service_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 60,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'cancelled' | 'rescheduled'
  gcal_event_id TEXT,
  nexfit_eligible BOOLEAN,
  idempotency_key TEXT UNIQUE,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### payments
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  appointment_id UUID REFERENCES appointments(id),
  asaas_charge_id TEXT UNIQUE,
  amount DECIMAL(10,2),
  status TEXT DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'overdue' | 'cancelled'
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### audit_log
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,   -- 'appointment' | 'payment' | 'customer' | 'conversation'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,        -- 'created' | 'updated' | 'cancelled' | 'rescheduled'
  actor TEXT,                  -- 'bot' | 'human' | 'system'
  before_state JSONB,
  after_state JSONB,
  channel TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### dead_letter_queue
```sql
CREATE TABLE dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'replayed' | 'discarded'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ
);
```

### incidents
```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL,  -- 'low' | 'medium' | 'high' | 'critical'
  type TEXT NOT NULL,
  description TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Contratos de Interface Internos

### ChannelMessage (payload normalizado de qualquer canal)
```typescript
interface ChannelMessage {
  id: string;                  // id único do evento no canal de origem
  channel: 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'site';
  from: string;                // phone_normalized ou user_id do canal
  text: string;
  media?: { type: string; url: string };
  timestamp: string;           // ISO 8601
  raw: Record<string, unknown>; // payload original para debug
}
```

### CustomerIdentity
```typescript
interface CustomerIdentity {
  id: string;           // UUID interno
  isNew: boolean;
  phoneNormalized: string;
  name?: string;
  nexfitId?: string;
}
```

### AppointmentRequest
```typescript
interface AppointmentRequest {
  customerId: string;
  serviceType: string;
  requestedAt: string;       // ISO 8601
  idempotencyKey: string;    // gerado na intenção, reutilizado em retry
}
```

---

## Marcos e Critérios de Aceite

### Marco 1 — Núcleo Omnichannel + RAG (R$ 700,00)
Homologação: 7 dias após entrega

Critérios:
- [ ] WhatsApp e Chatwoot operacionais (entrada e saída)
- [ ] Identidade do cliente funcionando sem duplicação (phone_normalized como chave)
- [ ] RAG operacional consultando base do Notion via pgvector
- [ ] Handoff humano funcional e reativação segura com contexto preservado
- [ ] Logs mínimos e tabela de incidentes funcionando

Implementar nesta ordem:
1. Infra base: Supabase, tabelas, variáveis de ambiente
2. Evolution API + Chatwoot: webhook, inbox configurado
3. Deduplicação de cliente: upsert por phone_normalized
4. RAG: sync Notion → chunks → embeddings → pgvector
5. Motor de IA: LLM + retriever + histórico
6. Handoff: detecção de intenção → atribuição Chatwoot → reativação
7. Logs e incidentes: middleware de observabilidade

### Marco 2 — Motor de Agenda (R$ 700,00)
Homologação: 7 dias após entrega

Critérios:
- [ ] Agendar, reagendar, cancelar e consultar sem inconsistências
- [ ] Sync bidirecional com Google Calendar validado
- [ ] Elegibilidade Nexfit aplicada corretamente antes de confirmar
- [ ] Locks e idempotência impedindo duplicações (locked_until + idempotency_key)
- [ ] Auditoria de alterações de agenda funcionando (audit_log)

Implementar nesta ordem:
1. Schema: appointments, audit_log, appointment_locks
2. Google Calendar: OAuth2, webhook, sync bidirecional
3. CRUD de agenda: com validação de disponibilidade em GCal e DB
4. Idempotência: chave gerada na intenção, reutilizada em retry
5. Locks otimistas: SELECT FOR UPDATE ou locked_until
6. Nexfit: consulta de elegibilidade antes da confirmação
7. Auditoria: trigger em todo INSERT/UPDATE de appointments

### Marco 3 — Canais Expandidos + Pagamentos + Automações (R$ 700,00)
Homologação: 7 dias após entrega

Critérios:
- [ ] Integração funcional com Site, Instagram, Messenger e TikTok
- [ ] Integração com Asaas validada (criação e confirmação de pagamento via webhook)
- [ ] Automações de lembretes (24h antes), confirmações e recuperação operacionais
- [ ] Identidade omnichannel consistente entre todos os canais
- [ ] Falhas corretamente registradas na DLQ (Supabase)

Implementar nesta ordem:
1. Meta Webhooks: Instagram + Messenger (normalizar para ChannelMessage)
2. TikTok Business API + widget de site via Chatwoot
3. Identidade omnichannel: unificar customer_id por canal em external_ids
4. Asaas: criação de cobrança pós-agendamento + webhook de confirmação
5. Automações: workers/cron para lembretes, confirmações, recuperação
6. DLQ: capturar falhas → dead_letter_queue com retry_count

### Marco 4 — Produção com Clientes Piloto (R$ 1.400,00)
Monitoramento assistido: 10 dias com 2 clientes piloto

Critérios:
- [ ] Sistema implantado nos 2 clientes piloto
- [ ] Auditoria completa, DLQ e replay funcionando
- [ ] Alerta de desconexão WhatsApp: detectar → gerar QR code → enviar por Telegram/e-mail/Chatwoot
- [ ] Nenhuma falha crítica sem incidente e alerta registrado
- [ ] Jornada completa validada:
      mensagem → resposta → agendamento → pagamento → confirmação → auditoria
- [ ] Sistema estável durante todo o período de monitoramento

---

## Regras Transversais (aplicar em todos os marcos)

### Idempotência
- Todo evento externo (webhook WhatsApp, Meta, Asaas) deve ter `event_id` único
- Sempre usar `ON CONFLICT DO NOTHING` ou verificar existência antes de inserir
- `idempotency_key` gerado no início da intenção do usuário, propagado em todos os serviços

### Deduplicação de cliente
- Sempre normalizar telefone antes de qualquer operação: remover espaços, garantir formato E.164
- Usar `phone_normalized` como chave de identidade, nunca criar duplicata

### Observabilidade
- Todo erro deve gerar registro em `incidents` com severidade adequada
- Toda falha em serviço externo deve ir para `dead_letter_queue`
- Logs estruturados (JSON) em toda chamada crítica

### Segurança de agenda
- Nunca confirmar agendamento sem verificar disponibilidade em GCal e no DB na mesma transação
- Reagendamento é atômico: cancela evento antigo + cria novo em uma única transação
- Locks expiram automaticamente (locked_until) para evitar deadlock

### Feature flags
- Subir canais novos (TikTok, Instagram) com flag desativada até validação completa
- Usar variável de ambiente: `FEATURE_TIKTOK_ENABLED=false`

---

## Variáveis de Ambiente Necessárias

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# OpenAI
OPENAI_API_KEY=

# Notion (RAG)
NOTION_TOKEN=
NOTION_DATABASE_ID=

# Evolution API (WhatsApp)
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=

# Chatwoot
CHATWOOT_API_URL=
CHATWOOT_API_KEY=
CHATWOOT_ACCOUNT_ID=
CHATWOOT_INBOX_ID=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_REFRESH_TOKEN=

# Nexfit
NEXFIT_API_URL=
NEXFIT_API_KEY=

# Asaas
ASAAS_API_URL=
ASAAS_API_KEY=

# Telegram (alertas)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALERT_CHAT_ID=

# Feature flags
FEATURE_INSTAGRAM_ENABLED=false
FEATURE_TIKTOK_ENABLED=false
FEATURE_MESSENGER_ENABLED=false
```

---

---

## Especificação do Motor de Chat Inteligente (v2 — corrigida)

Esta seção define como o bot deve se comportar. É a fonte da verdade para o system prompt,
a máquina de estados e a lógica de roteamento.

> **Causa raiz dos problemas mais comuns:** o LLM sendo chamado sem estado persistido —
> cada mensagem processada do zero, sem saber o que já foi coletado, causando loops,
> respostas genéricas e falha no reconhecimento de profissionais.

---

### Identidade do Bot

```
Nome: Sofia (personalizável por cliente via env ASSISTANT_NAME)
Tom: amigo que trabalha na academia — não robô de atendimento
Idioma: português brasileiro natural, coloquial mas profissional
Tamanho de resposta: 1-3 linhas. Nunca parágrafos longos.
Emojis: 1 por mensagem máximo. Zero em mensagens de erro ou problema.
```

---

### Regras Absolutas de Naturalidade

Estas regras devem estar literalmente no system prompt:

```
1. NUNCA faça duas perguntas na mesma mensagem. Uma por vez.
2. NUNCA ignore informação que o cliente já deu. Se ele disse "quero com a Ana",
   você JÁ SABE o profissional — não pergunte de novo.
3. NUNCA use linguagem robótica: proibido "Por favor informe", "Qual serviço deseja",
   "Como posso ajudá-lo", "Claro, com prazer".
4. Se o cliente mencionou um profissional, confirme o nome na resposta:
   "Ótimo, a Ana tem ótimas turmas de pilates!"
5. Varie as respostas — nunca use a mesma abertura duas vezes na mesma conversa.
6. Se já tem prof + modalidade + horário, vá direto para confirmação. Não pergunte mais nada.
7. Apresente horários em lista curta (máximo 3 opções), nunca em parágrafo.
8. Tom: "amigo atencioso que trabalha na academia", não "sistema de atendimento".
```

---

### Cadastro de Profissionais (injetar no system prompt via template)

Este bloco deve ser gerado dinamicamente a partir do banco de dados do cliente,
não hardcoded. A estrutura abaixo é o template:

```typescript
interface Profissional {
  nome: string;
  apelidos: string[];          // variações que o cliente pode usar no chat
  especialidades: string[];    // modalidades que este profissional atende
  disponibilidade?: string;    // descrição geral (ex: "seg a sex, manhã e tarde")
}

// Exemplo de dados reais injetados no prompt:
const profissionais: Profissional[] = [
  {
    nome: "Ana",
    apelidos: ["ana", "anna"],
    especialidades: ["pilates", "yoga", "alongamento"]
  },
  {
    nome: "Carlos",
    apelidos: ["carlos", "carol", "carlinhos"],
    especialidades: ["musculação", "funcional", "hiit"]
  }
];
```

O system prompt deve conter a lista completa formatada assim:
```
PROFISSIONAIS DISPONÍVEIS (reconheça nome ou apelido):
- Ana (apelidos: ana, anna): pilates, yoga, alongamento
- Carlos (apelidos: carlos, carol, carlinhos): musculação, funcional, hiit
- Beatriz (apelidos: beatriz, bia, bea): spinning, zumba, dança
- Rafael (apelidos: rafael, rafa): natação, hidroginástica
```

---

### Máquina de Estados da Conversa

O estado da conversa é um objeto persistido no banco (coluna `context` da tabela `conversations`).
Ele é injetado no system prompt a cada chamada e atualizado após cada resposta.

```typescript
interface ConversationState {
  fase: ConversationPhase;
  profissional: string | null;     // nome normalizado do profissional
  modalidade: string | null;       // modalidade escolhida
  horario: string | null;          // horário escolhido pelo cliente
  slotId: string | null;           // ID do slot no GCal
  nomeCliente: string | null;
  idempotencyKey: string;          // gerado no início da intenção, nunca muda
}

type ConversationPhase =
  | 'livre'              // sem intenção ativa
  | 'coletar_modalidade' // temos profissional, falta modalidade
  | 'coletar_horario'    // temos prof + modalidade, mostrar slots
  | 'confirmar'          // temos tudo, aguardando confirmação do cliente
  | 'concluido'          // agendamento criado com sucesso
  | 'handoff'            // transferido para humano
```

**Transições de fase:**
```
livre
  → [cliente menciona agendamento + profissional com 1 especialidade] → coletar_horario
  → [cliente menciona agendamento + profissional com N especialidades] → coletar_modalidade
  → [cliente menciona agendamento sem profissional] → livre (perguntar profissional)

coletar_modalidade
  → [cliente escolhe modalidade] → coletar_horario

coletar_horario
  → [cliente escolhe horário da lista] → confirmar

confirmar
  → [cliente confirma] → concluido (executar criação)
  → [cliente nega] → coletar_horario (mostrar outros slots)

concluido → livre (nova intenção)
```

---

### Formato de Resposta do LLM

O LLM deve retornar SEMPRE JSON válido. Nenhum texto fora do JSON.
Instrução obrigatória no system prompt: `"Retorne APENAS JSON. Nada antes, nada depois, sem markdown."`

```typescript
interface BotResponse {
  intent: 'AGENDAMENTO' | 'REAGENDAMENTO' | 'CANCELAMENTO' | 'CONSULTA_AGENDA'
        | 'PAGAMENTO' | 'FAQ' | 'HANDOFF' | 'SAUDACAO' | 'OUTRO';
  fase: ConversationPhase;       // fase resultante após esta resposta
  message: string;               // texto enviado ao cliente
  extraido: {                    // entidades extraídas da mensagem atual
    profissional: string | null;
    modalidade: string | null;
    horario: string | null;
    nomeCliente: string | null;
  };
  mostrarHorarios: boolean;      // se true → backend busca slots e anexa à mensagem
  triggerHandoff: boolean;       // se true → transfere para Chatwoot
  triggerPayment: boolean;       // se true → cria cobrança no Asaas
  triggerConfirmacao: boolean;   // se true → executar criação no GCal + DB
}
```

---

### System Prompt Completo (template de produção)

```
Você é {ASSISTANT_NAME}, assistente virtual de {STUDIO_NAME}.

PROFISSIONAIS DISPONÍVEIS (reconheça nome ou apelido — CRÍTICO):
{PROFISSIONAIS_LIST}

ESTADO ATUAL DA CONVERSA (não repita o que já foi coletado):
{CONVERSATION_STATE}

HISTÓRICO RECENTE (últimas 10 mensagens):
{CONVERSATION_HISTORY}

SLOTS DISPONÍVEIS PARA {PROFISSIONAL_SELECIONADO}:
{AVAILABLE_SLOTS}

CONTEXTO DA BASE DE CONHECIMENTO (RAG):
{RAG_CONTEXT}

DADOS DO CLIENTE:
{CUSTOMER_DATA}

REGRAS ABSOLUTAS:
1. Retorne APENAS JSON válido. Nada antes, nada depois, sem markdown.
2. NUNCA faça duas perguntas na mesma mensagem.
3. NUNCA ignore informação já fornecida pelo cliente.
4. NUNCA use tom robótico. Fale como um atendente humano simpático no WhatsApp.
5. NUNCA invente horários — use apenas os slots fornecidos em AVAILABLE_SLOTS.
6. NUNCA confirme agendamento sem ter: profissional + modalidade + slot confirmado.
7. Se o cliente mencionar nome de profissional, inclua o nome na resposta de forma natural.
8. Se cliente estiver frustrado (palavras: absurdo, horrível, errado, péssimo, vergonha),
   triggerHandoff: true imediatamente, sem tentar resolver.
9. Apresente horários em lista numerada, máximo 3 opções.
10. Se fase for "confirmar", não pergunte mais nada — apenas confirme os dados e aguarde.
```

---

### Fluxo de Agendamento Detalhado

```
ENTRADA: cliente envia mensagem

PASSO 1 — Extrair entidades
  Verificar mensagem + histórico por: profissional, modalidade, horário, nome do cliente
  Atualizar state.extraido com o que foi encontrado

PASSO 2 — Determinar próxima fase
  Se state.profissional e prof tem 1 especialidade → fase = 'coletar_horario'
  Se state.profissional e prof tem N especialidades e não temos modalidade → fase = 'coletar_modalidade'
  Se temos prof + modalidade e não temos slot → fase = 'coletar_horario', mostrarHorarios: true
  Se temos prof + modalidade + slot → fase = 'confirmar'

PASSO 3 — Buscar slots (se mostrarHorarios = true)
  Backend chama Google Calendar API com:
    - profissional: state.profissional
    - modalidade: state.modalidade
    - janela: próximos 7 dias
  Retorna até 5 slots disponíveis
  Injeta em {AVAILABLE_SLOTS} antes de chamar o LLM

PASSO 4 — Gerar resposta
  LLM gera mensagem natural com base no estado atual

PASSO 5 — Confirmar e criar (fase = 'concluido' + triggerConfirmacao = true)
  VERIFICAR disponibilidade do slot novamente (pode ter sido tomado)
  Se disponível:
    - INSERT appointments com idempotency_key (ON CONFLICT DO NOTHING)
    - Criar evento no Google Calendar
    - Verificar elegibilidade Nexfit
    - Se pagamento: triggerPayment = true → criar cobrança Asaas
    - Registrar em audit_log
    - Enviar mensagem de confirmação com detalhes
  Se não disponível:
    - NÃO criar nada
    - Voltar para fase 'coletar_horario' com mensagem de desculpa
    - mostrarHorarios: true com slots atualizados
```

---

### Fluxo de Handoff

```
TRIGGER: triggerHandoff = true

1. Bot envia:
   "Vou te conectar com um de nossos atendentes agora. Em breve alguém entra em contato! 😊"

2. Sistema:
   → Salvar state completo em conversations.context ANTES de transferir
   → Chatwoot API: assign_agent (agente disponível ou fila)
   → conversations.status = 'human'
   → audit_log: { action: 'handoff', actor: 'bot', before_state: state }

3. Reativação (agente fecha conversa no Chatwoot):
   → Webhook Chatwoot → conversations.status = 'bot'
   → Carregar context salvo anteriormente
   → Bot envia: "Tudo certo por aí? Posso te ajudar com mais alguma coisa? 😊"
   → NÃO perguntar informações que já foram coletadas antes do handoff
```

---

### Problemas Conhecidos e Correções

| Problema | Causa raiz | Correção implementada |
|---|---|---|
| Respostas genéricas e robóticas | System prompt sem regras de naturalidade | Regras absolutas explícitas no prompt com exemplos do que é proibido |
| Não reconhece profissional mencionado | Profissionais não cadastrados no prompt | Injetar lista de profissionais + apelidos dinamicamente via template |
| Loop de perguntas repetidas | Estado não persistido entre mensagens | `ConversationState` salvo no DB, injetado no prompt a cada chamada |
| Duas perguntas na mesma mensagem | LLM tentando coletar tudo de uma vez | Regra explícita: "NUNCA faça duas perguntas na mesma mensagem" |
| Confirma agendamento sem criar no GCal | LLM não valida resposta das APIs | `triggerConfirmacao` só envia mensagem APÓS criação bem-sucedida no GCal e DB |
| Inventa horários disponíveis | Slots não injetados no contexto | `{AVAILABLE_SLOTS}` obrigatório no prompt; se vazio, bot pede para aguardar |
| Duplicação de agendamento | Sem idempotência | `idempotency_key` gerado na fase `livre`, propagado até `concluido`, `ON CONFLICT DO NOTHING` |
| Histórico perdido após handoff | Context não salvo antes da transferência | Salvar `conversations.context` completo antes de mudar status para 'human' |

---

---

## Painel Admin (Frontend)

O painel admin é a interface onde **você** (o desenvolvedor/operador) configura cada cliente do sistema.
É uma aplicação web separada do backend, com autenticação própria.

### Stack do Frontend

```
Framework:    Next.js 14 (App Router)
UI:           shadcn/ui + Tailwind CSS
Auth:         Supabase Auth (magic link ou email/senha)
Estado:       Zustand ou React Query para server state
Deploy:       Vercel ou mesmo servidor do backend
```

### Multi-tenancy: estrutura de dados do painel

Cada "cliente" do sistema é um **tenant**. O painel gerencia múltiplos tenants.

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,               -- "Studio Fit SP"
  slug TEXT UNIQUE NOT NULL,        -- "studio-fit-sp"
  plan TEXT DEFAULT 'basic',        -- 'basic' | 'pro' | 'enterprise'
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tenant_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                -- chave da configuração
  value JSONB NOT NULL,             -- valor (pode ser string, objeto, array)
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

CREATE TABLE professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',       -- apelidos reconhecidos pelo bot
  specialties TEXT[] NOT NULL DEFAULT '{}',   -- modalidades atendidas
  gcal_calendar_id TEXT,                       -- calendário próprio no Google
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  duration_minutes INT DEFAULT 60,
  requires_handoff BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true
);
```

### Configurações por tenant (chaves da `tenant_config`)

| Chave | Tipo | Descrição |
|---|---|---|
| `bot.name` | string | Nome do assistente (ex: "Sofia") |
| `bot.studio_name` | string | Nome do studio nas mensagens |
| `bot.tone` | string | `friendly` \| `formal` \| `young` |
| `bot.welcome_message` | string | Primeira mensagem enviada ao cliente |
| `bot.handoff_message` | string | Mensagem ao transferir para humano |
| `whatsapp.instance` | string | Nome da instância na Evolution API |
| `whatsapp.phone` | string | Número conectado (E.164) |
| `whatsapp.alert_telegram` | boolean | Alertar desconexão via Telegram |
| `whatsapp.alert_email` | boolean | Alertar desconexão via e-mail |
| `gcal.account` | string | Email da conta Google |
| `gcal.calendar_id` | string | ID do calendário principal |
| `gcal.bidirectional_sync` | boolean | Sync bidirecional ativo |
| `asaas.api_key` | string (encrypted) | Chave API Asaas |
| `asaas.environment` | string | `production` \| `sandbox` |
| `asaas.charge_on_schedule` | boolean | Cobrar ao agendar |
| `nexfit.api_key` | string (encrypted) | Chave API Nexfit |
| `nexfit.check_eligibility` | boolean | Verificar elegibilidade |
| `nexfit.ineligible_action` | string | `block` \| `handoff` |
| `notion.token` | string (encrypted) | Token de integração Notion |
| `notion.database_id` | string | ID do banco de dados Notion |
| `notion.sync_interval_hours` | number | Intervalo de re-sync (1, 6, 24) |
| `schedule.default_duration` | number | Duração padrão em minutos |
| `schedule.slot_interval` | number | Intervalo entre slots em minutos |
| `schedule.cancel_policy_hours` | number | Horas mínimas para cancelar |
| `schedule.reminder_hours` | number | Horas antes para lembrete (0 = off) |
| `schedule.business_hours` | object | `{ mon: {open:"06:00", close:"22:00"}, ... }` |

### Seções do painel admin

#### 1. Dashboard (visão geral por tenant)
- Métricas do dia: conversas, agendamentos, handoffs, erros DLQ
- Status de todas as conexões (WhatsApp, GCal, Asaas, Nexfit, Notion)
- Botão de sync manual do RAG
- Seletor de tenant no topo (dropdown)

#### 2. Identidade do bot
- Nome do assistente e do studio
- Tom de comunicação (select)
- Mensagem de boas-vindas (textarea com preview)
- Mensagem de handoff
- Configuração do Notion (token + database_id + intervalo de sync)
- Botão "testar bot" → abre simulação de chat lateral

#### 3. Profissionais
- Lista com avatar, nome, apelidos e especialidades
- Cada apelido é um chip editável (add/remove inline)
- Cada especialidade é um chip editável
- Toggle ativo/inativo
- Botão de adicionar profissional (modal com formulário)
- Vinculação opcional com calendário individual no Google Calendar

#### 4. Serviços e modalidades
- Lista de serviços com nome, preço e duração
- Toggle "requer handoff" (ex: personal trainer)
- Toggle ativo/inativo por serviço
- Vinculação de serviço → profissionais que atendem

#### 5. Horários de funcionamento
- Toggle por dia da semana
- Horário de abertura e fechamento por dia
- Duração padrão de sessão
- Intervalo mínimo entre slots
- Política de cancelamento (horas mínimas)
- Lembrete automático (horas antes)

#### 6. Integrações (Conexões)
- **WhatsApp:** status da instância + botão reconectar + QR code inline + alertas
- **Google Calendar:** conta conectada + OAuth2 flow + toggle sync bidirecional
- **Asaas:** API key (mascarada) + ambiente + toggle cobrar ao agendar
- **Nexfit:** API key + toggle elegibilidade + ação se inelegível
- **Chatwoot:** URL + API key + inbox ID + agentes online
- **Telegram:** bot token + chat ID para alertas

#### 7. Fila de erros (DLQ)
- Lista de eventos com falha: tipo + mensagem de erro + tentativas + timestamp
- Botão "replay" individual e "replay todos"
- Botão "ver payload" (modal com JSON completo)
- Botão "descartar" (marca como `discarded`)
- Filtro por tipo de evento e status

#### 8. Auditoria
- Log paginado: tipo de ação + entidade + cliente + canal + timestamp
- Filtros: por tipo, por profissional, por canal, por período
- Botão "ver detalhes" (before_state + after_state em JSON)
- Exportação CSV

### Rotas do Next.js

```
/                         → redirect para /dashboard
/login                    → autenticação
/dashboard                → visão geral (selecionar tenant)
/[tenantSlug]/dashboard   → dashboard do tenant
/[tenantSlug]/bot         → identidade do bot
/[tenantSlug]/profissionais           → lista de profissionais
/[tenantSlug]/profissionais/[id]      → editar profissional
/[tenantSlug]/servicos                → serviços e modalidades
/[tenantSlug]/horarios                → horários e regras
/[tenantSlug]/integracoes             → conexões e integrações
/[tenantSlug]/integracoes/whatsapp    → QR code e reconexão
/[tenantSlug]/dlq                     → fila de erros
/[tenantSlug]/auditoria               → log de auditoria
/admin/tenants            → gerenciar todos os clientes (superadmin)
/admin/tenants/novo       → criar novo cliente
```

### API Routes (Next.js API ou backend separado)

```
GET    /api/tenants                          → listar tenants
POST   /api/tenants                          → criar tenant
GET    /api/tenants/:id/config               → ler config completa
PATCH  /api/tenants/:id/config               → salvar config (parcial)
GET    /api/tenants/:id/professionals        → listar profissionais
POST   /api/tenants/:id/professionals        → criar profissional
PATCH  /api/tenants/:id/professionals/:pid   → editar profissional
DELETE /api/tenants/:id/professionals/:pid   → remover profissional
GET    /api/tenants/:id/services             → listar serviços
POST   /api/tenants/:id/services             → criar serviço
PATCH  /api/tenants/:id/services/:sid        → editar serviço

GET    /api/tenants/:id/status               → status de todas as conexões
POST   /api/tenants/:id/rag/sync             → forçar re-sync do Notion
POST   /api/tenants/:id/whatsapp/reconnect   → reconectar WhatsApp
GET    /api/tenants/:id/whatsapp/qr          → obter QR code atual

GET    /api/tenants/:id/dlq                  → listar eventos DLQ
POST   /api/tenants/:id/dlq/:eid/replay      → replay de evento
POST   /api/tenants/:id/dlq/replay-all       → replay de todos pendentes
PATCH  /api/tenants/:id/dlq/:eid/discard     → descartar evento

GET    /api/tenants/:id/audit                → log paginado (?page=&type=&from=&to=)
GET    /api/tenants/:id/metrics              → métricas do dashboard
```

### Segurança do painel

```typescript
// Middleware de autenticação (Next.js middleware.ts)
// Toda rota /[tenantSlug]/* exige:
// 1. Usuário autenticado (Supabase Auth)
// 2. Usuário tem acesso ao tenant solicitado (tabela tenant_users)
// 3. Chaves sensíveis (API keys) nunca retornam em plaintext pelo frontend
//    → retornar apenas os últimos 4 chars: "••••••••••••1234"
//    → edição gera nova escrita no backend; leitura nunca expõe a chave completa

CREATE TABLE tenant_users (
  user_id UUID REFERENCES auth.users(id),
  tenant_id UUID REFERENCES tenants(id),
  role TEXT DEFAULT 'admin',   -- 'superadmin' | 'admin' | 'viewer'
  PRIMARY KEY (user_id, tenant_id)
);
```

### Comandos Codex para o frontend

```
Leia o AGENTS.md e crie a estrutura do projeto Next.js para o painel admin
com App Router, shadcn/ui, Supabase Auth e multi-tenancy.
```

```
Crie a página /[tenantSlug]/profissionais com lista editável de profissionais,
chips de apelidos e especialidades, toggles ativo/inativo, conforme o AGENTS.md.
```

```
Implemente a seção de integrações /[tenantSlug]/integracoes com status ao vivo
de cada conexão e o fluxo de reconexão WhatsApp com QR code inline.
```

```
Crie o componente de DLQ com replay individual e em lote, visualização de payload
e filtros por tipo e status, conforme especificado no AGENTS.md.
```

---

## Como Usar Este Arquivo com Codex

Execute no terminal do projeto:

```bash
Codex
```

Codex vai ler automaticamente este arquivo `AGENTS.md` como contexto do projeto.

Exemplos de comandos iniciais recomendados:

```
Leia o AGENTS.md e configure a estrutura de pastas do projeto para o Marco 1.
```

```
Com base no AGENTS.md, crie o script de migration SQL completo para o Supabase.
```

```
Implemente o serviço de identidade do cliente (deduplicação por phone_normalized) conforme o AGENTS.md.
```

```
Crie o gateway de entrada que normaliza payloads do WhatsApp/Evolution API para o formato ChannelMessage.
```
