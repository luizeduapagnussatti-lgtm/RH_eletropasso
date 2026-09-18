import React, { useEffect, useState } from 'react';
import { hmToMinutes, minutesToHm } from '../../utils/durationHm';

type Props = {
  valueMinutes: number | null | undefined;
  onChangeMinutes: (minutes: number) => void;
  className?: string;
  id?: string;
  /** When false, reject durations with hours ≥ 24 (default: allow weekly loads). */
  allowOver24h?: boolean;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
};

/**
 * Duration editor in Brazilian HH:mm. Commits on blur / Enter; keeps draft while typing.
 */
export const DurationHmInput: React.FC<Props> = ({
  valueMinutes,
  onChangeMinutes,
  className,
  id,
  allowOver24h = true,
  disabled,
  required,
  'aria-label': ariaLabel,
}) => {
  const [text, setText] = useState(() => minutesToHm(valueMinutes ?? 0));

  useEffect(() => {
    setText(minutesToHm(valueMinutes ?? 0));
  }, [valueMinutes]);

  const commit = () => {
    const parsed = hmToMinutes(text);
    if (parsed == null) {
      setText(minutesToHm(valueMinutes ?? 0));
      return;
    }
    if (!allowOver24h && Math.abs(parsed) >= 24 * 60) {
      setText(minutesToHm(valueMinutes ?? 0));
      return;
    }
    const next = Math.max(0, parsed);
    onChangeMinutes(next);
    setText(minutesToHm(next));
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="00:00"
      disabled={disabled}
      required={required}
      aria-label={ariaLabel}
      className={className}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

export default DurationHmInput;
