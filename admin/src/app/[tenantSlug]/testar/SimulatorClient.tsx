'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { sendSimulatorMessage, SimulatorResult } from './actions';

interface ConversationState {
  fase: string;
  profissional: string | null;
  modalidade: string | null;
  dia: string | null;
  horario: string | null;
  slotId: string | null;
  nomeCliente: string | null;
  idempotencyKey: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; args: unknown; result: string }[];
  intent?: string;
  fase?: string;
}

interface Props {
  tenantSlug: string;
  botName: string;
  welcomeMessage: string | null;
}

const EMPTY_KEY = '';

function freshState(key: string = EMPTY_KEY): ConversationState {
  return {
    fase: 'livre',
    profissional: null,
    modalidade: null,
    dia: null,
    horario: null,
    slotId: null,
    nomeCliente: null,
    idempotencyKey: key,
  };
}

function generateIdempotencyKey(): string {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateSessionId(): string {
  return `sim_session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function SimulatorClient({ tenantSlug, botName, welcomeMessage }: Props) {
  const initialMessages: ChatMessage[] = welcomeMessage
    ? [{ role: 'assistant', content: welcomeMessage }]
    : [];

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [state, setState] = useState<ConversationState>(freshState());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showDebug, setShowDebug] = useState(true);
  const [sessionId, setSessionId] = useState('');

  // idempotencyKey só é gerado no cliente para evitar hydration mismatch
  useEffect(() => {
    setState(s => (s.idempotencyKey ? s : { ...s, idempotencyKey: generateIdempotencyKey() }));
    const storageKey = `simulator-session:${tenantSlug}`;
    const existing = window.localStorage.getItem(storageKey);
    const next = existing || generateSessionId();
    window.localStorage.setItem(storageKey, next);
    setSessionId(next);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isPending]);

  const onSend = () => {
    const text = input.trim();
    if (!text || isPending) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(m => [...m, userMsg]);
    setInput('');
    setError(null);

    startTransition(async () => {
      try {
        const activeSessionId = sessionId || generateSessionId();
        if (!sessionId) {
          window.localStorage.setItem(`simulator-session:${tenantSlug}`, activeSessionId);
          setSessionId(activeSessionId);
        }
        const result: SimulatorResult = await sendSimulatorMessage(tenantSlug, {
          message: text,
          sessionId: activeSessionId,
        });
        setSessionId(result.sessionId);
        setState(result.newState);
        setMessages(m => [
          ...m,
          {
            role: 'assistant',
            content: result.reply.message,
            toolCalls: result.toolCalls,
            intent: result.reply.intent,
            fase: result.reply.fase,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const onReset = () => {
    const nextSessionId = generateSessionId();
    window.localStorage.setItem(`simulator-session:${tenantSlug}`, nextSessionId);
    setSessionId(nextSessionId);
    setMessages(initialMessages);
    setState(freshState(generateIdempotencyKey()));
    setError(null);
    setInput('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Chat */}
      <div className="bg-white rounded-xl shadow-sm flex flex-col h-[70vh]">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-gray-800">{botName}</span>
            <span className="text-[10px] uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              simulação
            </span>
          </div>
          <button
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-700"
            type="button"
          >
            Reiniciar conversa
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-gray-400 italic text-center mt-6">
              Comece a conversa enviando uma mensagem como se fosse um cliente.
            </p>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} />
          ))}

          {isPending && (
            <div className="flex">
              <div className="bg-gray-100 rounded-2xl px-4 py-2 text-sm text-gray-500">
                <span className="inline-block animate-pulse">digitando…</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="border-t p-3 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Digite como se fosse um cliente..."
            disabled={isPending}
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
          />
          <button
            onClick={onSend}
            disabled={isPending || !input.trim()}
            className="bg-blue-600 text-white text-sm px-5 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            type="button"
          >
            Enviar
          </button>
        </div>
      </div>

      {/* Debug panel */}
      <aside className="space-y-3">
        <div className="bg-white rounded-xl shadow-sm">
          <button
            onClick={() => setShowDebug(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
            type="button"
          >
            <span>Estado da conversa</span>
            <span className="text-gray-400">{showDebug ? '−' : '+'}</span>
          </button>

          {showDebug && (
            <div className="px-4 pb-4 space-y-2 text-xs">
              <StateRow label="Fase" value={state.fase} highlight />
              <StateRow label="Profissional" value={state.profissional} />
              <StateRow label="Modalidade" value={state.modalidade} />
              <StateRow label="Dia" value={state.dia} />
              <StateRow label="Horário" value={state.horario} />
              <StateRow label="Nome cliente" value={state.nomeCliente} />
              <StateRow label="Idempotency" value={state.idempotencyKey || null} mono />
            </div>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
          <p className="font-medium mb-1">Modo simulação real</p>
          <p>
            Este chat usa o mesmo fluxo do WhatsApp e persiste dados no banco. Agendamentos e
            cobranças são reais; apenas o envio externo para WhatsApp/Chatwoot fica bloqueado.
          </p>
        </div>
      </aside>
    </div>
  );
}

function StateRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span
        className={`text-right truncate ${
          mono ? 'font-mono text-[10px]' : ''
        } ${highlight ? 'text-blue-700 font-medium' : 'text-gray-800'}`}
      >
        {value ?? <span className="text-gray-300">—</span>}
      </span>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
            isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
          }`}
        >
          {msg.content}
        </div>
        {!isUser && (msg.intent || msg.fase) && (
          <div className="flex gap-1 text-[10px] text-gray-400">
            {msg.intent && <span className="bg-gray-50 px-1.5 py-0.5 rounded">{msg.intent}</span>}
            {msg.fase && <span className="bg-gray-50 px-1.5 py-0.5 rounded">→ {msg.fase}</span>}
          </div>
        )}
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <details className="text-[10px] text-gray-500 mt-1">
            <summary className="cursor-pointer hover:text-gray-700">
              {msg.toolCalls.length} tool call{msg.toolCalls.length > 1 ? 's' : ''}
            </summary>
            <div className="mt-1 space-y-1 pl-2 border-l-2 border-gray-200">
              {msg.toolCalls.map((tc, i) => (
                <div key={i} className="font-mono text-[10px] text-gray-600">
                  <div className="text-purple-600">{tc.name}({JSON.stringify(tc.args)})</div>
                  <div className="text-gray-500 pl-3 whitespace-pre-wrap">→ {tc.result}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
