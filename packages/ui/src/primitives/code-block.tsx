"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type HTMLAttributes } from "react";
import { cn } from "../cn.ts";

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  code: string;
  /** Shown as a label in the toolbar and set as `language-*` class on <code>. */
  language?: string;
  /** Optional title (file name, endpoint). */
  title?: string;
  /** Localized labels for the copy button and its confirmation. */
  copyLabel?: string;
  copiedLabel?: string;
  /** Dark stage look regardless of theme. */
  tone?: "surface" | "stage";
  wrap?: boolean;
}

/** Code block with language label and a copy button that announces its result politely. */
export function CodeBlock({ code, language, title, copyLabel = "Copy code", copiedLabel = "Copied", tone = "surface", wrap = false, className, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  useEffect(() => {
    setCanCopy(typeof navigator !== "undefined" && !!navigator.clipboard);
  }, []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-control)] border border-line text-sm", tone === "stage" ? "surface-stage" : "bg-surface-2", className)} {...props}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-ink-3">
          {title ? <span className="truncate font-medium text-ink-2">{title}</span> : null}
          {language ? <span className="rounded-[var(--radius-chip)] bg-surface px-1.5 py-0.5 font-mono text-[11px] uppercase">{language}</span> : null}
        </div>
        {canCopy ? (
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[var(--radius-control-sm)] px-2 text-xs font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary pointer-coarse:min-h-11"
            aria-label={copied ? copiedLabel : copyLabel}
          >
            {copied ? <Check className="size-3.5 text-ok" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            <span aria-hidden="true">{copied ? copiedLabel : copyLabel}</span>
          </button>
        ) : null}
      </div>
      <pre className={cn("overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-ink", wrap && "whitespace-pre-wrap break-words")} tabIndex={0}>
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}
