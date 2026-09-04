"use client";

import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { Brand, Container, IconButton, Sheet, buttonVariants, cn } from "@track-site/ui";
import { Link, usePathname } from "@/i18n/navigation";
import { pick } from "@/lib/marketing-copy/pick";
import { HEADER_COPY, type HeaderCopy, type NavGroup, type NavLink } from "@/lib/marketing-copy/shared";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Marketing header (docs/12 §3; supplement §3 "Header, Mega-/Dropdownnavigation und Mobile Drawer").
 *
 * Desktop (≥ lg): brand, a disclosure navigation (WAI-ARIA APG "disclosure navigation menu") with one
 * panel per group — Product, Integrations, Resources — the Pricing link, the language switcher and the
 * Log in / Start links styled as buttons. A panel opens on click or Enter/Space, on hover with a short
 * intent delay on fine pointers, and on ArrowDown (which also focuses its first link). Escape closes it
 * and returns focus to its button; ArrowLeft/ArrowRight move between top-level items; ArrowUp/Down and
 * Home/End move inside a panel; focus leaving the item or a click outside closes it. Panels are
 * server-rendered (their links are in the HTML) and hidden with `visibility`, so a closed panel is out
 * of the tab order and the accessibility tree. Motion is transform/opacity only and the global
 * reduced-motion rule neutralises it.
 *
 * Mobile (< lg): brand, the Start link and a menu button that opens a right-hand <Sheet> (portal, focus
 * trap, inert background, Escape, focus restore) with accordion groups, the Pricing link, both CTAs and
 * the inline language switcher. Every target is ≥ 44 px; links are <a>, actions are <button>, never
 * nested. `variant="compact"` (auth shell) keeps only the brand and the language switcher.
 *
 * Copy comes from HEADER_COPY (lib/marketing-copy/shared.ts) for the active locale; hrefs are
 * locale-neutral and next-intl's <Link> adds the prefix.
 */
type GroupKey = NavGroup["key"];

function basePath(href: string): string {
  return href.split(/[#?]/)[0] || "/";
}
function isCurrent(pathname: string, href: string): boolean {
  return pathname === basePath(href);
}
function isWithin(pathname: string, href: string): boolean {
  const base = basePath(href);
  return base !== "/" && (pathname === base || pathname.startsWith(`${base}/`));
}
function groupActive(pathname: string, group: NavGroup): boolean {
  return group.columns.some((column) => column.links.some((link) => isWithin(pathname, link.href))) || (group.more ? isWithin(pathname, group.more.href) : false);
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Top-level item: text + a 2 px cobalt bar on the header edge for the current section (not colour only: the bar is a shape). */
const topItem = cn(
  "relative inline-flex min-h-10 items-center gap-1 rounded-[var(--radius-control-sm)] px-3 text-sm font-medium text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 hover:text-ink pointer-coarse:min-h-11",
  "after:absolute after:inset-x-3 after:-bottom-3 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity after:duration-[var(--motion-fast)] data-[active=true]:text-ink data-[active=true]:after:opacity-100",
  "aria-expanded:bg-surface-2 aria-expanded:text-ink",
  focusRing,
);

export function MarketingHeader({ variant = "full" }: { variant?: "full" | "compact" }) {
  const locale = useLocale();
  const pathname = usePathname();
  const copy = pick(locale, HEADER_COPY);
  const [drawer, setDrawer] = useState(false);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const full = variant === "full";
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-ground/85 backdrop-blur supports-[backdrop-filter]:bg-ground/70">
      <Container className="relative flex h-16 items-center gap-2 sm:gap-4">
        <Link href="/" aria-label={copy.brandHome} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-[var(--radius-control-sm)]", focusRing)}>
          <Brand size={32} textClassName="text-lg" />
        </Link>
        {full ? <DesktopNav copy={copy} pathname={pathname} /> : null}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LocaleSwitcher label={copy.language} className={full ? "hidden lg:block" : undefined} />
          {full ? (
            <>
              <Link href={copy.login.href} aria-current={isCurrent(pathname, copy.login.href) ? "page" : undefined} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden lg:inline-flex")}>
                {copy.login.label}
              </Link>
              {/* below 360 px the German label ("Kostenlos starten") no longer fits next to brand + menu button; the drawer carries both CTAs */}
              <Link href={copy.start.href} className={cn(buttonVariants({ size: "sm" }), "max-[359px]:hidden")}>
                {copy.start.label}
              </Link>
              <IconButton label={copy.openMenu} aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)} className="lg:hidden">
                <Menu className="size-5" aria-hidden="true" />
              </IconButton>
            </>
          ) : null}
        </div>
      </Container>
      {/* keyed by pathname so the pre-expanded group follows the current section after client-side navigations (the layout stays mounted) */}
      {full ? <MobileMenu key={pathname} copy={copy} pathname={pathname} open={drawer} onClose={closeDrawer} /> : null}
    </header>
  );
}

/* ------------------------------------------------------------------- desktop */

function DesktopNav({ copy, pathname }: { copy: HeaderCopy; pathname: string }) {
  const [openKey, setOpenKey] = useState<GroupKey | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const baseId = useId();
  const hoverable = useRef(false);
  const timer = useRef<number | null>(null);
  const focusFirst = useRef<GroupKey | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    hoverable.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    return clearTimer;
  }, [clearTimer]);

  // a click anywhere outside the navigation closes the open panel
  useEffect(() => {
    if (!openKey) return;
    const onPointer = (event: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenKey(null);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [openKey]);

  // a keyboard open (ArrowDown) lands on the panel's first link once it is visible
  useEffect(() => {
    if (!openKey || focusFirst.current !== openKey) return;
    focusFirst.current = null;
    document.getElementById(`${baseId}-${openKey}-panel`)?.querySelector<HTMLElement>("a[href]")?.focus();
  }, [openKey, baseId]);

  const open = useCallback(
    (key: GroupKey, focus = false) => {
      clearTimer();
      if (focus) focusFirst.current = key;
      setOpenKey(key);
    },
    [clearTimer],
  );
  const close = useCallback(() => {
    clearTimer();
    setOpenKey(null);
  }, [clearTimer]);
  const hoverOpen = useCallback(
    (key: GroupKey) => {
      if (!hoverable.current) return;
      clearTimer();
      timer.current = window.setTimeout(() => setOpenKey(key), 120);
    },
    [clearTimer],
  );
  const hoverClose = useCallback(() => {
    if (!hoverable.current) return;
    clearTimer();
    timer.current = window.setTimeout(() => setOpenKey(null), 200);
  }, [clearTimer]);

  const onTopKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const target = event.target as HTMLElement;
    if (!target.hasAttribute("data-nav-top")) return;
    const tops = Array.from(navRef.current?.querySelectorAll<HTMLElement>("[data-nav-top]") ?? []);
    const index = tops.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    close();
    tops[(index + (event.key === "ArrowRight" ? 1 : tops.length - 1)) % tops.length]?.focus();
  };

  return (
    <nav ref={navRef} aria-label={copy.mainNav} className="hidden flex-1 lg:flex lg:justify-center">
      <ul className="flex items-center gap-1" onKeyDown={onTopKeyDown}>
        {copy.groups.map((group) => (
          <NavGroupItem
            key={group.key}
            group={group}
            pathname={pathname}
            open={openKey === group.key}
            active={groupActive(pathname, group)}
            buttonId={`${baseId}-${group.key}-button`}
            panelId={`${baseId}-${group.key}-panel`}
            hoverable={hoverable}
            onOpen={open}
            onClose={close}
            onHoverOpen={hoverOpen}
            onHoverClose={hoverClose}
          />
        ))}
        <li className="flex h-16 items-center">
          <Link href={copy.pricing.href} data-nav-top="" data-active={isWithin(pathname, copy.pricing.href) || undefined} aria-current={isCurrent(pathname, copy.pricing.href) ? "page" : undefined} className={topItem} onPointerEnter={hoverClose}>
            {copy.pricing.label}
          </Link>
        </li>
      </ul>
    </nav>
  );
}

interface NavGroupItemProps {
  group: NavGroup;
  pathname: string;
  open: boolean;
  active: boolean;
  buttonId: string;
  panelId: string;
  hoverable: RefObject<boolean>;
  onOpen: (key: GroupKey, focus?: boolean) => void;
  onClose: () => void;
  onHoverOpen: (key: GroupKey) => void;
  onHoverClose: () => void;
}

function NavGroupItem({ group, pathname, open, active, buttonId, panelId, hoverable, onOpen, onClose, onHoverOpen, onHoverClose }: NavGroupItemProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const links = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    // a hover-opened panel stays open on a pointer click; keyboard activation (detail 0) always toggles
    if (open && event.detail > 0 && hoverable.current) return;
    if (open) onClose();
    else onOpen(group.key);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    const target = event.target as HTMLElement;
    const inPanel = panelRef.current?.contains(target) ?? false;
    switch (event.key) {
      case "Escape": {
        if (!open) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        buttonRef.current?.focus();
        return;
      }
      case "ArrowDown": {
        event.preventDefault();
        if (!open) {
          onOpen(group.key, true);
          return;
        }
        const items = links();
        const index = inPanel ? items.indexOf(target) : -1;
        items[Math.min(index + 1, items.length - 1)]?.focus();
        return;
      }
      case "ArrowUp": {
        if (!inPanel) return;
        event.preventDefault();
        const items = links();
        const index = items.indexOf(target);
        if (index <= 0) buttonRef.current?.focus();
        else items[index - 1]?.focus();
        return;
      }
      case "Home":
      case "End": {
        if (!inPanel) return;
        event.preventDefault();
        const items = links();
        (event.key === "Home" ? items[0] : items[items.length - 1])?.focus();
        return;
      }
      default:
    }
  };

  const onBlur = (event: FocusEvent<HTMLLIElement>) => {
    const next = event.relatedTarget as Node | null;
    if (open && next && !event.currentTarget.contains(next)) onClose();
  };

  return (
    <li className="flex h-16 items-center" onPointerEnter={() => onHoverOpen(group.key)} onPointerLeave={onHoverClose} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button ref={buttonRef} type="button" id={buttonId} data-nav-top="" data-active={active || undefined} aria-expanded={open} aria-controls={panelId} onClick={onClick} className={topItem}>
        {group.label}
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div ref={panelRef} id={panelId} className={cn("absolute inset-x-0 top-full z-40 pt-2 transition-[opacity,transform,visibility] duration-[var(--motion-base)] ease-in-out", open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0")}>
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-6 shadow-pop">
          <div className="grid grid-cols-3 gap-8">
            {group.columns.map((column) => (
              <div key={column.key ?? column.title} className={cn("min-w-0", column.wide && "col-span-2")}>
                <p className="mb-2 px-3 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3">{column.title}</p>
                <ul className={cn("grid gap-0.5", column.wide && "grid-cols-2 gap-x-4")}>
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <PanelLink link={link} current={isCurrent(pathname, link.href)} onNavigate={onClose} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {group.more ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4">
              <Link href={group.more.href} aria-current={isCurrent(pathname, group.more.href) ? "page" : undefined} onClick={onClose} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-[var(--radius-control-sm)] px-3 text-sm font-medium text-primary underline-offset-4 hover:underline", focusRing)}>
                {group.more.label}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              {group.more.description ? <span className="text-small text-ink-3">{group.more.description}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PanelLink({ link, current, onNavigate }: { link: NavLink; current: boolean; onNavigate: () => void }) {
  return (
    <Link href={link.href} aria-current={current ? "page" : undefined} onClick={onNavigate} className={cn("group flex min-h-10 flex-col justify-center rounded-[var(--radius-control-sm)] px-3 py-2 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 aria-[current=page]:bg-primary-soft", focusRing)}>
      <span className="text-sm font-medium text-ink group-hover:text-primary">{link.label}</span>
      {link.description ? <span className="mt-0.5 text-small text-ink-3">{link.description}</span> : null}
    </Link>
  );
}

/* -------------------------------------------------------------------- mobile */

function MobileMenu({ copy, pathname, open, onClose }: { copy: HeaderCopy; pathname: string; open: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<GroupKey | null>(() => copy.groups.find((group) => groupActive(pathname, group))?.key ?? copy.groups[0]?.key ?? null);
  const id = useId();
  const item = cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-control-sm)] px-3 text-left text-base font-medium text-ink transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2", focusRing);
  const sub = cn("flex min-h-11 items-center rounded-[var(--radius-control-sm)] px-3 text-sm text-ink-2 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-primary-soft aria-[current=page]:text-ink", focusRing);
  return (
    <Sheet open={open} onClose={onClose} title={copy.menuTitle} closeLabel={copy.closeMenu} side="right">
      <nav aria-label={copy.mainNav}>
        <ul className="divide-y divide-line">
          {copy.groups.map((group) => {
            const isOpen = expanded === group.key;
            const panelId = `${id}-${group.key}`;
            return (
              <li key={group.key} className="py-1">
                <button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setExpanded(isOpen ? null : group.key)} className={item}>
                  {group.label}
                  <ChevronDown className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-[var(--motion-fast)] ease-out", isOpen && "rotate-180")} aria-hidden="true" />
                </button>
                <div id={panelId} hidden={!isOpen} className="pb-2">
                  {group.columns.map((column) => (
                    <div key={column.key ?? column.title} className="mt-1">
                      <p className="px-3 pt-2 pb-1 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3">{column.title}</p>
                      <ul>
                        {column.links.map((link) => (
                          <li key={link.href}>
                            <Link href={link.href} aria-current={isCurrent(pathname, link.href) ? "page" : undefined} onClick={onClose} className={sub}>
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {group.more ? (
                    <Link href={group.more.href} onClick={onClose} className={cn("mt-1 flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control-sm)] px-3 text-sm font-medium text-primary", focusRing)}>
                      {group.more.label}
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
          <li className="py-1">
            <Link href={copy.pricing.href} aria-current={isCurrent(pathname, copy.pricing.href) ? "page" : undefined} onClick={onClose} className={cn(item, "aria-[current=page]:bg-primary-soft")}>
              {copy.pricing.label}
            </Link>
          </li>
        </ul>
      </nav>
      <div className="mt-4 grid gap-2 border-t border-line pt-4">
        <Link href={copy.start.href} onClick={onClose} className={buttonVariants({ size: "lg" })}>
          {copy.start.label}
        </Link>
        <Link href={copy.login.href} onClick={onClose} className={buttonVariants({ variant: "secondary", size: "lg" })}>
          {copy.login.label}
        </Link>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <p className="mb-2 px-3 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3" aria-hidden="true">
          {copy.language}
        </p>
        <LocaleSwitcher variant="inline" label={copy.language} onNavigate={onClose} className="px-3" />
      </div>
    </Sheet>
  );
}
