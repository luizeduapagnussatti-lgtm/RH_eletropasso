import React from 'react';
import { Edit3, Plus, Trash2, type LucideIcon } from 'lucide-react';

/** Shared interactive hover used across Organização (matches Admin Dashboard). */
export const orgInteractive =
  'transition-all duration-200 ease-out motion-reduce:transition-none hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md hover:bg-primary-light/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:hover:translate-y-0';

export function orgTabButtonClass(active: boolean): string {
  return [
    'min-w-[5.5rem] flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap',
    'flex items-center justify-center gap-1.5',
    'transition-all duration-200 ease-out motion-reduce:transition-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
    active
      ? 'bg-white text-primary shadow-sm border border-primary/25'
      // Inactive: slate-700 stays readable in light mode; dark-mode CSS remaps it to #e2e8f0.
      // Avoid slate-600 — it washed out on the tab rail when bg-slate-100/80 lacked a dark override.
      : 'text-slate-700 border border-transparent hover:bg-white hover:text-slate-900 hover:border-slate-200',
  ].join(' ');
}

interface OrgPanelProps {
  icon: LucideIcon;
  title: string;
  countLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
}

/** White panel with quiet header + primary CTA (no solid primary banner). */
export const OrgPanel: React.FC<OrgPanelProps> = ({
  icon: Icon,
  title,
  countLabel,
  actionLabel,
  onAction,
  children,
  className = '',
}) => (
  <section
    className={`bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col ${className}`}
  >
    <div className="px-4 py-3.5 md:px-5 md:py-4 border-b border-slate-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-primary-light text-primary flex items-center justify-center">
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>
          {countLabel ? (
            <p className="text-xs font-medium text-slate-500 mt-0.5">{countLabel}</p>
          ) : null}
        </div>
      </div>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={actionLabel}
        >
          <Plus size={16} aria-hidden />
          {actionLabel ? <span className="hidden sm:inline">{actionLabel}</span> : null}
        </button>
      ) : null}
    </div>
    {children}
  </section>
);

interface OrgListRowProps {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  editLabel: string;
  deleteLabel: string;
}

export const OrgListRow: React.FC<OrgListRowProps> = ({
  label,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}) => (
  <div
    className={`flex items-center justify-between gap-3 p-3 md:p-3.5 bg-slate-50 border border-slate-100 rounded-lg group ${orgInteractive}`}
  >
    <span className="font-semibold text-slate-800 text-sm break-words min-w-0 flex-1">{label}</span>
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        onClick={onEdit}
        title={editLabel}
        aria-label={editLabel}
        className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-primary hover:bg-white/80 transition-colors"
      >
        <Edit3 size={16} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
        className="min-h-9 min-w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </div>
  </div>
);
