'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props { tenantSlug: string }

const navItems = [
  { label: 'Dashboard', href: 'dashboard' },
  { label: 'Identidade do Bot', href: 'bot' },
  { label: 'Profissionais', href: 'profissionais' },
  { label: 'Serviços', href: 'servicos' },
  { label: 'Horários', href: 'horarios' },
  { label: 'Integrações', href: 'integracoes' },
  { label: 'Fila de Erros', href: 'dlq' },
  { label: 'Auditoria', href: 'auditoria' },
];

export function SidebarNav({ tenantSlug }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r bg-gray-50 flex flex-col p-4 gap-1 min-h-screen">
      <Link href="/dashboard" className="text-xs font-bold text-gray-400 uppercase mb-2 hover:text-gray-600">
        ← Clientes
      </Link>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1 truncate">{tenantSlug}</p>

      {navItems.map(item => {
        const href = `/${tenantSlug}/${item.href}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
              active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}
