import type { ComponentProps, ReactNode } from "react";
import { ConsentGate, DestinationChip, Diagram, FlowEdge, FlowNode, SignalDot, VisuallyHidden } from "@track-site/ui";
import { Link } from "@/i18n/navigation";
import type { MdxComponents } from "@/lib/knowledge-article";
import type { KnowledgeArticleCopy } from "@/lib/marketing-copy/knowledge-article";
import { Callout } from "./callout";
import { ArticlePre } from "./code";
import { Steps } from "./steps";

interface CalloutProps {
  /** Overrides the localized default title ("Note", "Warning", …). */
  title?: string;
  children?: ReactNode;
}

/**
 * Component map for article MDX (documented for authors in docs/13-knowledge-authoring.md).
 * Named blocks: `Note`, `Warning`, `Privacy`, `Practice`, `Steps` and the SVG data-flow primitives
 * (`Diagram`, `FlowNode`, `FlowEdge`, `ConsentGate`, `DestinationChip`, `SignalDot`). HTML
 * overrides: fenced code → CodeBlock with copy button, tables scroll inside their own container,
 * external links carry rel attributes, internal links go through next-intl and keep the locale
 * prefix. All server components; the only client island is the CodeBlock's copy button.
 */
export function articleMdxComponents(copy: KnowledgeArticleCopy): MdxComponents {
  function Note({ title, children }: CalloutProps) {
    return (
      <Callout tone="note" title={title ?? copy.callouts.note}>
        {children}
      </Callout>
    );
  }
  function Warning({ title, children }: CalloutProps) {
    return (
      <Callout tone="warning" title={title ?? copy.callouts.warning}>
        {children}
      </Callout>
    );
  }
  function Privacy({ title, children }: CalloutProps) {
    return (
      <Callout tone="privacy" title={title ?? copy.callouts.privacy}>
        {children}
      </Callout>
    );
  }
  function Practice({ title, children }: CalloutProps) {
    return (
      <Callout tone="practice" title={title ?? copy.callouts.practice}>
        {children}
      </Callout>
    );
  }
  function StepsBlock({ children }: { children?: ReactNode }) {
    return <Steps label={copy.steps}>{children}</Steps>;
  }
  function Pre({ children }: { children?: ReactNode }) {
    return <ArticlePre labels={copy.code}>{children}</ArticlePre>;
  }
  function TableBlock({ className: _className, ...props }: ComponentProps<"table">) {
    return (
      <div className="my-6 w-full min-w-0 overflow-x-auto">
        <table className="w-full border-collapse text-small" {...props} />
      </div>
    );
  }
  function Th({ className: _className, ...props }: ComponentProps<"th">) {
    return <th scope="col" className="border-b border-line-2 px-3 py-2 text-left align-bottom font-semibold text-ink" {...props} />;
  }
  function Td({ className: _className, ...props }: ComponentProps<"td">) {
    return <td className="border-b border-line px-3 py-2 align-top" {...props} />;
  }
  /**
   * GFM task lists (`- [ ]` / `- [x]`) are editorial checklists, not forms: remark-gfm emits a disabled
   * `<input type="checkbox">` without a label (axe `label`, critical). Render the state as a decorative
   * marker plus visually hidden localized text instead, so the information stays in the text and no
   * unlabeled form control reaches the page. Any other `input` in MDX is not supported and is dropped.
   */
  function TaskCheckbox({ type, checked }: ComponentProps<"input">) {
    if (type !== "checkbox") return null;
    const done = checked === true;
    return (
      <>
        <span aria-hidden="true" data-checked={done ? "" : undefined} className="mt-[0.3em] inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line-2 bg-surface text-[0.7rem] font-semibold leading-none text-primary data-checked:border-primary">
          {done ? "✓" : ""}
        </span>
        <VisuallyHidden>{done ? copy.checklist.done : copy.checklist.open}: </VisuallyHidden>
      </>
    );
  }
  function Li({ className, ...props }: ComponentProps<"li">) {
    if (className?.split(" ").includes("task-list-item")) return <li className="flex list-none items-start gap-2" {...props} />;
    return <li className={className} {...props} />;
  }
  function Anchor({ href = "", children, ref: _ref, ...rest }: ComponentProps<"a">) {
    if (href.startsWith("/")) {
      return (
        <Link href={href} {...rest}>
          {children}
        </Link>
      );
    }
    const external = /^https?:\/\//i.test(href);
    return (
      <a href={href} rel={external ? "noopener noreferrer" : undefined} {...rest}>
        {children}
      </a>
    );
  }
  return { Note, Warning, Privacy, Practice, Steps: StepsBlock, Diagram, FlowNode, FlowEdge, ConsentGate, DestinationChip, SignalDot, pre: Pre, table: TableBlock, th: Th, td: Td, a: Anchor, input: TaskCheckbox, li: Li };
}
