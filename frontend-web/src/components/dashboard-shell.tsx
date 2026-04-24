"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  Compass,
  Home,
  Search,
  Settings,
  Store,
  UserRound,
} from "lucide-react";
import {
  SidebarWithSubmenu,
  type SidebarNavItem,
} from "@/components/ui/sidebar-with-submenu";
import { clearSession } from "@/lib/auth";
import type { AuthUser } from "@/types/auth";

type DashboardShellProps = {
  user: AuthUser;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  role: "buyer" | "partner";
  headerActions?: React.ReactNode;
};

const NAV_ITEMS: Record<"buyer" | "partner", SidebarNavItem[]> = {
  buyer: [
    { label: "Home", href: "/dashboard/buyer", icon: Home },
    { label: "Discover", href: "/dashboard/buyer/discover", icon: Compass },
    { label: "Appointments", href: "/dashboard/buyer/appointments", icon: CalendarDays },
    { label: "Profile", href: "/dashboard/buyer/profile", icon: UserRound },
  ],
  partner: [
    { label: "Home", href: "/dashboard/partner", icon: Home },
    { label: "Catalog", href: "/dashboard/partner/catalog", icon: Store },
    { label: "Bookings", href: "/dashboard/partner/bookings", icon: CalendarDays },
    { label: "Boutique", href: "/dashboard/partner/boutique", icon: Settings },
  ],
};

export function DashboardShell({
  user,
  title,
  subtitle,
  children,
  role,
  headerActions,
}: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="page-shell min-h-screen">
      <div className="grid-lines min-h-screen w-full lg:flex">
        <SidebarWithSubmenu
          pathname={pathname}
          user={user}
          roleLabel={role === "buyer" ? "Signed In As" : "Workspace Owner"}
          items={NAV_ITEMS[role]}
          onLogout={() => {
            clearSession();
            router.replace("/");
          }}
        />

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="pill-label text-black/45">
                {role === "buyer" ? "Bride Workspace" : "Boutique Workspace"}
              </p>
              <h1 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-slate-950 lg:text-5xl">
                {title}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 lg:text-base">
                {subtitle}
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[360px] lg:items-end">
              {headerActions ?? (
                <div className="flex h-12 w-full items-center gap-3 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-400 shadow-sm lg:max-w-[360px]">
                  <Search className="h-5 w-5" />
                  <span>Search dashboard</span>
                </div>
              )}
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
