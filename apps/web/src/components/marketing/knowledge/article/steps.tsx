import type { ReactNode } from "react";

/**
 * Numbered step sequence. Wraps a Markdown ordered list (see docs/13-knowledge-authoring.md): the
 * list stays a real `<ol>` for assistive technology, the markers become circled numbers through a
 * CSS counter, and multi-paragraph steps keep their spacing. No JavaScript.
 */
export function Steps({ children, label }: { children?: ReactNode; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      data-steps=""
      className="my-6 [&>ol]:m-0 [&>ol]:list-none [&>ol]:p-0 [&>ol]:[counter-reset:step] [&>ol>li]:relative [&>ol>li]:min-h-8 [&>ol>li]:pl-12 [&>ol>li]:[counter-increment:step] [&>ol>li]:before:absolute [&>ol>li]:before:top-0 [&>ol>li]:before:left-0 [&>ol>li]:before:flex [&>ol>li]:before:size-8 [&>ol>li]:before:items-center [&>ol>li]:before:justify-center [&>ol>li]:before:rounded-full [&>ol>li]:before:bg-primary-soft [&>ol>li]:before:font-display [&>ol>li]:before:text-sm [&>ol>li]:before:font-bold [&>ol>li]:before:text-primary [&>ol>li]:before:content-[counter(step)] [&>ol>li+li]:mt-5 [&>ol>li>*+*]:mt-2"
    >
      {children}
    </div>
  );
}
