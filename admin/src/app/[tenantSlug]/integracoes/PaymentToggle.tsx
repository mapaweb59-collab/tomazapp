'use client';

import { useTransition } from 'react';

interface Props {
  enabled: boolean;
  action: (formData: FormData) => Promise<void>;
}

export function PaymentToggle({ enabled, action }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="pt-3 border-t flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-800">Cobrança automática pelo bot</p>
        <p className="text-xs text-gray-400">
          {enabled
            ? 'Bot pode criar cobranças após confirmar agendamento'
            : 'Bot não cria cobranças (somente agenda)'}
        </p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={pending}
          onChange={e => {
            const fd = new FormData();
            if (e.currentTarget.checked) fd.set('enabled', 'on');
            startTransition(() => action(fd));
          }}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-200 peer-checked:bg-green-500 rounded-full transition-colors relative after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5 peer-disabled:opacity-50" />
      </label>
    </div>
  );
}
