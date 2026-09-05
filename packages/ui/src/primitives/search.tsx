"use client";

import { Check, Search, X } from "lucide-react";
import { useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../cn.ts";

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "size"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name (visually hidden unless `showLabel`). */
  label: string;
  showLabel?: boolean;
  clearLabel?: string;
  /** Optional live result summary, announced politely (e.g. "12 integrations"). */
  resultsText?: string;
  size?: "md" | "lg";
}

/** Search input with icon, clear button and a polite results announcement. */
export function SearchField({ value, onValueChange, label, showLabel = false, clearLabel = "Clear search", resultsText, size = "md", className, id, ...props }: SearchFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={inputId} className={cn("mb-1.5 block text-sm font-medium text-ink", !showLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
        <input
          id={inputId}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            "w-full rounded-[var(--radius-control)] border border-line-2 bg-surface pr-10 pl-9 text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-[var(--motion-fast)] hover:border-ink-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 [&::-webkit-search-cancel-button]:hidden",
            size === "lg" ? "min-h-12 text-base" : "min-h-10 text-sm pointer-coarse:min-h-11",
          )}
          {...props}
        />
        {value ? (
          <button type="button" onClick={() => onValueChange("")} aria-label={clearLabel} className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control-sm)] text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {resultsText !== undefined ? (
        <p className="mt-1.5 text-xs text-ink-3" role="status" aria-live="polite">
          {resultsText}
        </p>
      ) : null}
    </div>
  );
}

export interface FilterChipOption<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface FilterChipsProps<T extends string = string> extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: Array<FilterChipOption<T>>;
  /** Selected values (multi) or a single value in an array. */
  value: T[];
  onValueChange: (value: T[]) => void;
  /** Accessible name of the group. */
  label: string;
  /** Allow multiple selections (default) or exactly one. */
  multiple?: boolean;
  /** Optional "all" chip that clears the selection. */
  allLabel?: string;
}

/** Toggle chips (`aria-pressed`) in a labelled group; the only place the pill radius is used. */
export function FilterChips<T extends string = string>({ options, value, onValueChange, label, multiple = true, allLabel, className, ...props }: FilterChipsProps<T>) {
  const toggle = (option: T) => {
    if (multiple) onValueChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
    else onValueChange(value.includes(option) ? [] : [option]);
  };
  const chip = (active: boolean, disabled?: boolean) =>
    cn(
      "inline-flex min-h-9 items-center gap-1.5 rounded-[var(--radius-chip)] border px-3 text-sm font-medium transition-[background-color,color,border-color] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
      active ? "border-primary bg-primary-soft text-primary" : "border-line-2 bg-surface text-ink-2 hover:border-ink-3 hover:text-ink",
      disabled && "pointer-events-none",
    );
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-2", className)} {...props}>
      {allLabel ? (
        <button type="button" aria-pressed={value.length === 0} onClick={() => onValueChange([])} className={chip(value.length === 0)}>
          {allLabel}
        </button>
      ) : null}
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <button key={option.value} type="button" aria-pressed={active} disabled={option.disabled} onClick={() => toggle(option.value)} className={chip(active, option.disabled)}>
            {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {option.label}
            {option.count !== undefined ? <span className={cn("text-xs tabular-nums", active ? "text-primary" : "text-ink-3")}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
