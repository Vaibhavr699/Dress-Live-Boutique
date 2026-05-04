"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, ChevronDown, LogOut, type LucideIcon } from "lucide-react";
import type { AuthUser } from "@/types/auth";

export type SidebarSubmenuItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  match?: (pathname: string) => boolean;
};

export type SidebarNavItem = {
  label: string;
  href?: string;
  icon: LucideIcon;
  items?: SidebarSubmenuItem[];
  match?: (pathname: string) => boolean;
};

type SidebarWithSubmenuProps = {
  pathname: string;
  user: AuthUser;
  roleLabel: string;
  items: SidebarNavItem[];
  footerItems?: SidebarNavItem[];
  onLogout: () => void;
  brandName?: string;
  brandHref?: string;
};

function isSubItemActive(pathname: string, item: SidebarSubmenuItem) {
  if (item.match) {
    return item.match(pathname);
  }

  return pathname === item.href;
}

function isItemActive(pathname: string, item: SidebarNavItem) {
  if (item.match) {
    return item.match(pathname);
  }

  if (item.href && pathname === item.href) {
    return true;
  }

  return item.items?.some((subItem) => isSubItemActive(pathname, subItem)) ?? false;
}

export function SidebarWithSubmenu({
  pathname,
  user,
  roleLabel,
  items,
  footerItems = [],
  onLogout,
  brandName = "Dress Live",
  brandHref = "/",
}: SidebarWithSubmenuProps) {
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  return (
    <aside className="flex w-full flex-col border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(248,250,252,0.94)_100%)] p-4 backdrop-blur-sm lg:sticky lg:top-0 lg:h-screen lg:w-[274px] lg:border-b-0 lg:border-r lg:px-4 lg:py-5">
      <div className="flex h-full flex-col">
        <Link
          href={brandHref}
          className="flex items-center gap-3 rounded-[24px] border border-slate-200/80 bg-white/80 px-3 py-3 text-slate-950 shadow-[0_12px_32px_rgba(15,23,42,0.05)] transition hover:bg-white"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-slate-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.14)]">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="font-serif-display block text-[1.75rem] tracking-[-0.04em] text-slate-950">
              {brandName}
            </span>
            <span className="pill-label block pt-1 text-black/45">Dashboard</span>
          </span>
        </Link>

        <nav className="mt-6 flex-1 space-y-2 overflow-y-auto">
          {items.map((item) => {
            const active = isItemActive(pathname, item);
            const Icon = item.icon;
            const hasChildren = Boolean(item.items?.length);
            const submenuOpen = hasChildren
              ? openMenus[item.label] ?? item.items?.some((subItem) => isSubItemActive(pathname, subItem))
              : false;

            if (hasChildren) {
              return (
                <div key={item.label} className="space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenMenus((current) => ({
                        ...current,
                        [item.label]: !submenuOpen,
                      }))
                    }
                    className={`flex w-full items-center gap-3 rounded-[22px] px-3 py-3 text-left transition ${
                      active
                        ? "bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]"
                        : "text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 text-sm font-medium">{item.label}</span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 shrink-0 transition duration-300 ${
                        submenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {submenuOpen ? (
                    <div className="space-y-1 border-l border-slate-200/80 pl-4 lg:ml-7">
                      {item.items?.map((subItem) => {
                        const subActive = isSubItemActive(pathname, subItem);
                        const SubIcon = subItem.icon;

                        return (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`flex items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm transition ${
                              subActive
                                ? "bg-slate-100 text-slate-950"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            }`}
                          >
                            {SubIcon ? <SubIcon className="h-4 w-4 shrink-0" /> : null}
                            <span className="truncate">{subItem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <Link
                key={item.href || item.label}
                href={item.href || "#"}
                className={`flex items-center gap-3 rounded-[22px] px-3 py-3 transition ${
                  active
                    ? "bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]"
                    : "text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {footerItems.length ? (
          <div className="mt-6 space-y-2 border-t border-slate-200/80 pt-4">
            {footerItems.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href || item.label}
                  href={item.href || "#"}
                  className={`flex items-center gap-3 rounded-[22px] px-3 py-3 transition ${
                    active
                      ? "bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]"
                      : "text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      active ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        <div className="mt-6 border-t border-slate-200/80 pt-4 lg:mt-auto">
          <div className="flex items-center gap-3 rounded-[24px] bg-white/85 px-3 py-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
              {(user.full_name || user.email).trim().charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <p className="pill-label text-black/45">{roleLabel}</p>
              <p className="mt-2 truncate text-sm font-semibold text-slate-900">
                {user.full_name || "Dress Live User"}
              </p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="mt-3 flex w-full items-center gap-3 rounded-[22px] border border-slate-200 bg-white px-3 py-3 text-slate-900 transition hover:bg-slate-900 hover:text-white"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <LogOut className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-sm font-medium">Log Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
