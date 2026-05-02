'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  tenantSlug: string;
  tenantName?: string;
  tenantPlan?: string;
}

const navItems = [
  { label: 'Dashboard',        href: 'dashboard',     key: 'D' },
  { label: 'Identidade do Bot', href: 'bot',          key: 'I' },
  { label: 'Testar Bot',       href: 'testar',        key: 'T' },
  { label: 'Profissionais',    href: 'profissionais', key: 'P' },
  { label: 'Serviços',         href: 'servicos',      key: 'S' },
  { label: 'Horários',         href: 'horarios',      key: 'H' },
  { label: 'Integrações',      href: 'integracoes',   key: 'N' },
  { label: 'Fila de Erros',    href: 'dlq',           key: 'F' },
  { label: 'Auditoria',        href: 'auditoria',     key: 'A' },
];

export function SidebarNav({ tenantSlug, tenantName, tenantPlan }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-[#0f1117] flex flex-col min-h-screen shrink-0">
      {/* Studio header */}
      <div className="px-5 pt-6 pb-4 border-b border-white/5">
        <Link href="/dashboard" className="block group">
          <p className="text-[11px] text-white/30 group-hover:text-white/50 transition-colors mb-0.5">
            ← todos os clientes
          </p>
          <p className="text-sm font-semibold text-white truncate">
            {tenantName ?? tenantSlug}
          </p>
        </Link>
        {tenantPlan && (
          <span className="mt-1.5 inline-flex items-center text-[10px] font-medium bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full">
            {tenantPlan}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(item => {
          const href = `/${tenantSlug}/${item.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              <span>{item.label}</span>
              <kbd className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                active
                  ? 'border-white/20 text-white/60 bg-white/5'
                  : 'border-white/10 text-white/20'
              }`}>
                {item.key}
              </kbd>
            </Link>
          );
        })}
      </nav>

      {/* Bottom shortcuts */}
      <div className="px-3 pb-5 pt-3 border-t border-white/5 space-y-1">
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-white/30 hover:bg-white/5 hover:text-white/60 transition-colors">
          <span>Buscar</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">⌘K</kbd>
        </button>
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-white/30 hover:bg-white/5 hover:text-white/60 transition-colors">
          <span>Reconectar WA</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">R</kbd>
        </button>
        <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-white/30 hover:bg-white/5 hover:text-white/60 transition-colors">
          <span>Nova ação</span>
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/10">N</kbd>
        </button>
      </div>
    </aside>
  );
}
