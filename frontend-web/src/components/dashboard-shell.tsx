"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession } from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

type DashboardShellProps = {
  user: AuthUser;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  role: "buyer" | "partner";
};

const NAV_ITEMS = {
  buyer: [
    { label: "Overview", href: "/dashboard/buyer" },
    { label: "Discover", href: "/dashboard/buyer#discover" },
    { label: "Appointments", href: "/dashboard/buyer#appointments" },
    { label: "Profile", href: "/dashboard/buyer#profile" },
  ],
  partner: [
    { label: "Overview", href: "/dashboard/partner" },
    { label: "Catalog", href: "/dashboard/partner#catalog" },
    { label: "Bookings", href: "/dashboard/partner#bookings" },
    { label: "Boutique", href: "/dashboard/partner#boutique" },
  ],
} as const;

export function DashboardShell({
  user,
  title,
  subtitle,
  children,
  role,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 lg:flex-row lg:px-8 lg:py-8">
        <aside className="card-surface mb-4 flex w-full flex-col rounded-[28px] px-5 py-6 lg:mb-0 lg:mr-6 lg:min-h-[calc(100vh-4rem)] lg:w-[300px]">
          <Link href="/" className="font-serif-display text-[32px] tracking-[-0.04em] text-black">
            Dress Live
          </Link>
          <p className="mt-2 max-w-[18rem] text-sm leading-6 text-black/55">
            Unified portal for brides and boutiques. Access the same platform from a web-first workspace.
          </p>

          <div className="hero-divider my-6" />

          <div className="rounded-[24px] border border-black/10 bg-white/70 px-4 py-4">
            <p className="pill-label text-black/45">{role === "buyer" ? "Buyer Access" : "Partner Access"}</p>
            <p className="mt-3 text-lg font-medium text-black">{user.full_name || user.email}</p>
            <p className="mt-1 text-sm text-black/45">{user.email}</p>
          </div>

          <nav className="mt-8 space-y-2">
            {NAV_ITEMS[role].map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-full px-4 py-3 text-sm transition ${
                    active
                      ? "bg-black text-white"
                      : "border border-black/10 bg-white/70 text-black/70 hover:border-black/20 hover:text-black"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-white" : "bg-black/20"}`} />
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => {
              clearSession();
              router.replace("/");
            }}
            className="mt-auto rounded-full border border-black/15 bg-white px-4 py-3 text-sm text-black transition hover:bg-black hover:text-white"
          >
            Log Out
          </button>
        </aside>

        <main className="card-surface grid-lines flex-1 rounded-[32px] px-5 py-6 lg:px-10 lg:py-10">
          <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="pill-label text-black/45">{role === "buyer" ? "Bride Workspace" : "Boutique Workspace"}</p>
              <h1 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black lg:text-5xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55 lg:text-base">{subtitle}</p>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
