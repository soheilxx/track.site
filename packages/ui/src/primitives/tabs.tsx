"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../cn.ts";

/**
 * Tabs with the WAI-ARIA tabs pattern: roving tabindex (only the selected tab is tabbable),
 * arrow keys / Home / End move selection, panels are labelled by their tab.
 *
 *   <Tabs defaultValue="overview">
 *     <TabList aria-label="Demo views"><Tab value="overview">Overview</Tab>…</TabList>
 *     <TabPanel value="overview">…</TabPanel>
 *   </Tabs>
 */
interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
  orientation: "horizontal" | "vertical";
  activation: "automatic" | "manual";
}
const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error(`<${component}> must be rendered inside <Tabs>`);
  return ctx;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  /** `automatic` selects on arrow-key focus (default); `manual` requires Enter/Space. */
  activation?: "automatic" | "manual";
}

export function Tabs({ value, defaultValue, onValueChange, orientation = "horizontal", activation = "automatic", className, children, ...props }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;
  const baseId = useId();
  const setValue = useCallback(
    (next: string) => {
      if (value === undefined) setInternal(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );
  const ctx = useMemo(() => ({ value: current, setValue, baseId, orientation, activation }), [current, setValue, baseId, orientation, activation]);
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn(orientation === "vertical" && "flex gap-6", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /** `line` (underline, default) or `pill` (segmented control). */
  variant?: "line" | "pill";
}

export function TabList({ className, variant = "line", onKeyDown, ...props }: TabListProps) {
  const { orientation, activation, setValue } = useTabs("TabList");
  const ref = useRef<HTMLDivElement>(null);
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !ref.current) return;
    const tabs = Array.from(ref.current.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
    const index = tabs.findIndex((tab) => tab === document.activeElement);
    if (index < 0 || tabs.length === 0) return;
    const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    let target = -1;
    if (event.key === nextKey) target = (index + 1) % tabs.length;
    else if (event.key === prevKey) target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    if (target < 0) return;
    event.preventDefault();
    const tab = tabs[target];
    if (!tab) return;
    tab.focus();
    const next = tab.dataset.value;
    if (activation === "automatic" && next !== undefined) setValue(next);
  };
  return (
    <div
      ref={ref}
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex max-w-full gap-1 overflow-x-auto",
        orientation === "vertical" ? "flex-col" : "flex-row",
        variant === "line" && orientation === "horizontal" && "border-b border-line",
        variant === "pill" && "w-fit rounded-[var(--radius-control)] bg-surface-2 p-1",
        className,
      )}
      data-variant={variant}
      {...props}
    />
  );
}

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  icon?: ReactNode;
}

export function Tab({ value, icon, className, children, onClick, disabled, ...props }: TabProps) {
  const { value: selectedValue, setValue, baseId } = useTabs("Tab");
  const selected = selectedValue === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      data-value={value}
      data-state={selected ? "active" : "inactive"}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setValue(value);
      }}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-base)] ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11",
        // line variant
        "in-data-[variant=line]:-mb-px in-data-[variant=line]:border-b-2 in-data-[variant=line]:border-transparent in-data-[variant=line]:text-ink-2 in-data-[variant=line]:hover:text-ink in-data-[variant=line]:data-[state=active]:border-primary in-data-[variant=line]:data-[state=active]:text-ink",
        // pill variant
        "in-data-[variant=pill]:rounded-[var(--radius-control-sm)] in-data-[variant=pill]:text-ink-2 in-data-[variant=pill]:hover:text-ink in-data-[variant=pill]:data-[state=active]:bg-surface in-data-[variant=pill]:data-[state=active]:text-ink in-data-[variant=pill]:data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  /** Keep the panel in the DOM (hidden) when inactive; default unmounts it. */
  keepMounted?: boolean;
}

export function TabPanel({ value, keepMounted = false, className, children, ...props }: TabPanelProps) {
  const { value: selectedValue, baseId } = useTabs("TabPanel");
  const selected = selectedValue === value;
  if (!selected && !keepMounted) return null;
  return (
    <div role="tabpanel" id={`${baseId}-panel-${value}`} aria-labelledby={`${baseId}-tab-${value}`} hidden={!selected} tabIndex={0} className={cn("min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", className)} {...props}>
      {children}
    </div>
  );
}
