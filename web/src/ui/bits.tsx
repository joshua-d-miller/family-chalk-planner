/*
===============================================================================
 Family Chalk Planner | Screens | UI | bits.tsx
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-17

 Purpose:
     Small building blocks: buttons, fields, segmented choices
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 1.1.0    2026-11-17   joshua    Tabs: the parts of a long card, one at a
                        claude    time.
===============================================================================
*/

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------- //
// | Buttons | //
// ----------- //
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'go' | 'warn' | 'on' | 'round' };
export function Btn({ kind, className, type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={['btn', kind, className].filter(Boolean).join(' ')} {...rest} />;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Fields | //
// ---------- //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | A choice of a few | //
// --------------------- //
// Buttons in a row, one of them picked (radio buttons, to a screen reader). //
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------- //
// | Tabs | //
// -------- //
// The parts of a long card, one at a time: a row of tabs that slides        //
// sideways when it doesn't fit. A dot marks a tab with changes of its own.  //
export function Tabs<T extends string>({
  value,
  options,
  onChange,
  label,
  marked = []
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
  marked?: T[];
}) {
  return (
    <div className="ctabs" role="tablist" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="tab"
          id={'tab-' + v}
          aria-selected={v === value}
          className={'ctab' + (v === value ? ' on' : '')}
          onClick={e => {
            onChange(v);
            (e.currentTarget as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
        >
          {text}
          {marked.includes(v) && <span className="tdot" aria-label="changed" />}
        </button>
      ))}
    </div>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
