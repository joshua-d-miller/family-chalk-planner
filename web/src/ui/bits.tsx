// Small building blocks: buttons, fields, segmented choices
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'go' | 'warn' | 'on' | 'round' };
export function Btn({ kind, className, type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={['btn', kind, className].filter(Boolean).join(' ')} {...rest} />;
}

export function Field({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...rest} />
    </label>
  );
}

export function Pick({
  label,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select {...rest}>{children}</select>
    </label>
  );
}

export function Segs<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="segs" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className={'seg' + (v === value ? ' on' : '')}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
