import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, MessageCircle, Search, Shield } from 'lucide-react';
import type { MessagingChannel } from '../../types';
import {
  isEligibleForChannel,
  type MessagingEmployeeLike,
} from '../../utils/messagingThrottle';

interface Props {
  employees: MessagingEmployeeLike[];
  channels: MessagingChannel[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  disabled?: boolean;
}

export const MessagingRecipientPicker: React.FC<Props> = ({
  employees,
  channels,
  selectedIds,
  onSelectionChange,
  disabled = false,
}) => {
  const { t } = useTranslation('messaging');
  const [query, setQuery] = useState('');

  const externalChannels = useMemo(
    () => channels.filter(c => c === 'EMAIL' || c === 'WHATSAPP') as ('EMAIL' | 'WHATSAPP')[],
    [channels],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees
      .filter(emp => {
        if (!q) return true;
        return emp.name.toLowerCase().includes(q) || (emp.email ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, query]);

  const eligibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const emp of employees) {
      if (externalChannels.some(ch => isEligibleForChannel(emp, ch))) {
        ids.add(emp.id);
      }
    }
    return ids;
  }, [employees, externalChannels]);

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const selectAllEligible = () => onSelectionChange(new Set(eligibleIds));
  const selectNone = () => onSelectionChange(new Set());

  if (externalChannels.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-500 uppercase">{t('recipientPickerTitle')}</p>
        <span className="text-[10px] text-slate-400">
          {t('recipientSelected', { count: selectedIds.size, total: eligibleIds.size })}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={selectAllEligible}
          className="px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('recipientSelectAll')}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={selectNone}
          className="px-2.5 py-1 text-[10px] font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('recipientSelectNone')}
        </button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={disabled}
          placeholder={t('recipientSearch')}
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800"
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">{t('recipientEmpty')}</p>
        ) : (
          filtered.map(emp => {
            const waOk = isEligibleForChannel(emp, 'WHATSAPP');
            const emailOk = isEligibleForChannel(emp, 'EMAIL');
            const anyOk = externalChannels.some(ch => isEligibleForChannel(emp, ch));
            const checked = selectedIds.has(emp.id);

            return (
              <label
                key={emp.id}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  !anyOk ? 'opacity-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || !anyOk}
                  onChange={() => toggleOne(emp.id)}
                  className="w-4 h-4 accent-primary shrink-0"
                />
                <span className="flex-1 text-sm text-slate-800 dark:text-slate-200 truncate">{emp.name}</span>
                <span className="flex gap-1 shrink-0">
                  {externalChannels.includes('EMAIL') && (
                    <Mail size={12} className={emailOk ? 'text-emerald-500' : 'text-slate-300'} />
                  )}
                  {externalChannels.includes('WHATSAPP') && (
                    <MessageCircle size={12} className={waOk ? 'text-emerald-500' : 'text-slate-300'} />
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-[11px] text-amber-800 dark:text-amber-200">
        <Shield size={13} className="shrink-0 mt-0.5" />
        <span>{t('recipientSafetyHint')}</span>
      </div>
    </div>
  );
};

export default MessagingRecipientPicker;
