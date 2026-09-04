"use client";

import { Check, ChevronDown, Minus } from "lucide-react";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "../cn.ts";

/**
 * Form controls with default / hover / focus-visible / disabled / error / success states.
 * `state="error"` sets aria-invalid; `state="success"` is visual only (pair it with a hint).
 * Wrap controls in <Field> to get label, hint and error wired with aria-describedby.
 */
export type FieldState = "default" | "error" | "success";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink", className)} {...props} />;
}

const fieldBase =
  "w-full rounded-[var(--radius-control)] border border-line-2 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-3 shadow-none transition-[border-color,box-shadow,background-color] duration-[var(--motion-fast)] ease-out hover:border-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 aria-invalid:border-bad aria-invalid:focus:ring-bad/20 data-[state=success]:border-ok data-[state=success]:focus:ring-ok/20";

type StateProps = { state?: FieldState };
const stateAttrs = (state: FieldState | undefined) => ({ "aria-invalid": state === "error" || undefined, "data-state": state && state !== "default" ? state : undefined });

export function Input({ className, state, ...props }: InputHTMLAttributes<HTMLInputElement> & StateProps) {
  return <input className={cn(fieldBase, "min-h-10 pointer-coarse:min-h-11", className)} {...stateAttrs(state)} {...props} />;
}
export function Textarea({ className, state, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & StateProps) {
  return <textarea className={cn(fieldBase, "min-h-28", className)} {...stateAttrs(state)} {...props} />;
}
export function Select({ className, state, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & StateProps) {
  return (
    <span className="relative block">
      <select className={cn(fieldBase, "min-h-10 appearance-none pr-9 pointer-coarse:min-h-11", className)} {...stateAttrs(state)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
    </span>
  );
}

const boxBase =
  "peer size-5 shrink-0 appearance-none border border-line-2 bg-surface transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)] ease-out hover:border-ink-3 checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  description?: ReactNode;
  indeterminate?: boolean;
  state?: FieldState;
}

/** Native checkbox with a 44 px hit area, label and optional description. */
export function Checkbox({ className, label, description, indeterminate = false, state, id, disabled, ...props }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;
  // Mixed state goes through the IDL property (ARIA in HTML forbids aria-checked on a native checkbox).
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label htmlFor={inputId} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink has-disabled:cursor-not-allowed has-disabled:opacity-60", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
        <input ref={ref} id={inputId} type="checkbox" className={cn(boxBase, "rounded-[6px]")} aria-describedby={descId} disabled={disabled} {...stateAttrs(state)} {...props} />
        {indeterminate ? <Minus className="pointer-events-none absolute size-3.5 text-on-primary opacity-0 peer-checked:opacity-100" aria-hidden="true" strokeWidth={3} /> : <Check className="pointer-events-none absolute size-3.5 text-on-primary opacity-0 peer-checked:opacity-100" aria-hidden="true" strokeWidth={3} />}
      </span>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span className="block font-medium">{label}</span> : null}
          {description ? (
            <span id={descId} className="block text-ink-3">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode;
  description?: ReactNode;
  state?: FieldState;
}

/** Native radio; group several with the same `name` inside a <fieldset> with a <legend>. */
export function Radio({ className, label, description, state, id, disabled, ...props }: RadioProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = description ? `${inputId}-desc` : undefined;
  return (
    <label htmlFor={inputId} className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm text-ink has-disabled:cursor-not-allowed has-disabled:opacity-60", className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center">
        <input id={inputId} type="radio" className={cn(boxBase, "rounded-full checked:bg-surface")} aria-describedby={descId} disabled={disabled} {...stateAttrs(state)} {...props} />
        <span className="pointer-events-none absolute size-2.5 rounded-full bg-primary opacity-0 peer-checked:opacity-100" aria-hidden="true" />
      </span>
      {label || description ? (
        <span className="min-w-0">
          {label ? <span className="block font-medium">{label}</span> : null}
          {description ? (
            <span id={descId} className="block text-ink-3">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
}

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
}

/** Accessible switch (`role="switch"`, space/enter toggle). Prefer a Checkbox for form submissions. */
export function Switch({ checked, onCheckedChange, label, description, className, id, disabled, ...props }: SwitchProps) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const labelId = label ? `${switchId}-label` : undefined;
  const descId = description ? `${switchId}-desc` : undefined;
  return (
    <div className={cn("flex min-h-11 items-start gap-3 py-2", disabled && "opacity-60", className)}>
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-[var(--radius-chip)] border border-transparent transition-colors duration-[var(--motion-base)] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed",
          checked ? "bg-primary" : "bg-line-2",
        )}
        {...props}
      >
        <span aria-hidden="true" className={cn("inline-flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-[var(--motion-base)] ease-out", checked ? "translate-x-5" : "translate-x-0.5")}>
          {checked ? <Check className="size-3 text-primary" strokeWidth={3} /> : null}
        </span>
      </button>
      {label || description ? (
        <span className="min-w-0 text-sm text-ink">
          {label ? (
            <label id={labelId} htmlFor={switchId} className="block cursor-pointer font-medium">
              {label}
            </label>
          ) : null}
          {description ? (
            <span id={descId} className="block text-ink-3">
              {description}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export function FieldError({ children, id, className }: { children?: ReactNode; id?: string; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("mt-1 text-sm text-bad", className)}>
      {children}
    </p>
  );
}

export function FieldHint({ children, id, className }: { children?: ReactNode; id?: string; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} className={cn("mt-1 text-sm text-ink-3", className)}>
      {children}
    </p>
  );
}

export interface FieldProps {
  /** Id of the control rendered by `children`; generated when omitted. */
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown next to the label, e.g. "optional". */
  meta?: ReactNode;
  required?: boolean;
  className?: string;
  /** Render prop receives the id and aria attributes to spread onto the control. */
  children: (control: { id: string; "aria-describedby": string | undefined; "aria-invalid": true | undefined; required: boolean | undefined; state: FieldState }) => ReactNode;
}

/** Label + control + hint/error slots, wired with aria-describedby and aria-invalid. */
export function Field({ id, label, hint, error, meta, required, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label htmlFor={controlId}>
          {label}
          {required ? (
            <span className="ml-0.5 text-bad" aria-hidden="true">
              *
            </span>
          ) : null}
        </Label>
        {meta ? <span className="text-xs text-ink-3">{meta}</span> : null}
      </div>
      {children({ id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, required, state: error ? "error" : "default" })}
      <FieldError id={errorId}>{error}</FieldError>
      <FieldHint id={hintId}>{hint}</FieldHint>
    </div>
  );
}
