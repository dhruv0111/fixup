"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";
import { SignOutButton } from "@/components/forms/session-actions";
import { isActive, type VisibleGroup } from "./nav";

function NavList({
  groups,
  pathname,
}: {
  groups: VisibleGroup[];
  pathname: string;
}) {
  const navId = useId();
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const needle = filter.trim().toLowerCase();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <nav aria-label="Administration" className="admin-nav">
      {total > 6 && (
        <label className="admin-nav-search">
          <span className="sr-only">Search admin pages</span>
          <input
            type="search"
            placeholder="Search pages…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
      )}
      {groups.map((g) => {
        const items = needle
          ? g.items.filter((i) => i.label.toLowerCase().includes(needle))
          : g.items;
        if (!items.length) return null;
        const single = g.items.length === 1 && g.id === "overview";
        const hasActive = g.items.some((i) => isActive(i, pathname));
        const open = needle || single || hasActive || !closed[g.id];
        return (
          <div key={g.id} className="admin-nav-group">
            {!single && (
              <button
                type="button"
                className="admin-nav-heading"
                aria-expanded={!!open}
                aria-controls={`${navId}-${g.id}`}
                onClick={() => setClosed({ ...closed, [g.id]: !!open })}
              >
                {g.label}
                <span aria-hidden="true" className="admin-chevron">
                  {open ? "▾" : "▸"}
                </span>
              </button>
            )}
            {open && (
              <ul id={`${navId}-${g.id}`}>
                {items.map((i) => {
                  const active = isActive(i, pathname);
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        className="admin-nav-link"
                        aria-current={active ? "page" : undefined}
                        data-active={active || undefined}
                      >
                        <Icon name={i.icon} />
                        {i.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {!!needle &&
        !groups.some((g) =>
          g.items.some((i) => i.label.toLowerCase().includes(needle)),
        ) && <p className="px-3 text-sm text-muted">No matching pages.</p>}
    </nav>
  );
}

export function AdminShell({
  groups,
  userName,
  children,
}: {
  groups: VisibleGroup[];
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The drawer is open only for the path it was opened on, so navigating closes it.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const trigger = menuButton.current;
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
      if (e.key !== "Tab" || !drawer.current) return;
      const f = [
        ...drawer.current.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled]),input",
        ),
      ];
      if (!f.length) return;
      const first = f[0],
        last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);
  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <button
          ref={menuButton}
          type="button"
          className="admin-menu-button admin-menu-trigger"
          aria-label="Open admin menu"
          aria-expanded={open}
          aria-controls="admin-drawer"
          onClick={() => setOpenFor(pathname)}
        >
          <span aria-hidden="true">☰</span> Menu
        </button>
        <Link
          href="/admin"
          className="admin-brand"
          aria-label="FIXUP admin home"
        >
          FIXUP<span>.</span>
          <small>Admin</small>
        </Link>
        <div className="admin-topbar-actions">
          <span className="admin-user" title={userName}>
            {userName}
          </span>
          <Link href="/" className="admin-top-link">
            View website
          </Link>
          <Link href="/account" className="admin-top-link">
            My account
          </Link>
          <SignOutButton />
        </div>
      </header>
      <aside className="admin-sidebar" aria-label="Admin sidebar">
        <NavList groups={groups} pathname={pathname} />
      </aside>
      {open && (
        <div className="admin-drawer-layer">
          <button
            type="button"
            className="admin-drawer-scrim"
            aria-label="Close admin menu"
            tabIndex={-1}
            onClick={() => setOpenFor(null)}
          />
          <div
            id="admin-drawer"
            ref={drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="admin-drawer"
          >
            <div className="admin-drawer-head">
              <strong>FIXUP Admin</strong>
              <button
                ref={closeButton}
                type="button"
                className="admin-menu-button"
                onClick={() => setOpenFor(null)}
              >
                <span aria-hidden="true">✕</span> Close
              </button>
            </div>
            <NavList groups={groups} pathname={pathname} />
          </div>
        </div>
      )}
      <div className="admin-content">{children}</div>
    </div>
  );
}
