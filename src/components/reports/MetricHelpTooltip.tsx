import React, { useId, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
  label: string;
  helpText: string;
}

export const MetricHelpTooltip: React.FC<Props> = ({ label, helpText }) => {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="inline-flex items-center gap-1 relative">
      <span>{label}</span>
      <button
        type="button"
        className="inline-flex text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-full"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(v => !v)}
        onBlur={() => setOpen(false)}
      >
        <HelpCircle size={12} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute z-20 left-0 top-full mt-1 w-52 rounded-lg bg-slate-900 text-white text-[10px] leading-relaxed px-2.5 py-2 shadow-lg"
        >
          {helpText}
        </span>
      )}
    </span>
  );
};
