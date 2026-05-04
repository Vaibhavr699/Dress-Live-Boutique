"use client";

import {
  CalendarDays,
  Compass,
  CreditCard,
  FolderKanban,
  Home,
  Settings,
} from "lucide-react";
import { SidebarWithSubmenu, type SidebarNavItem } from "@/components/ui/sidebar-with-submenu";
import type { AuthUser } from "@/types/auth";

const demoUser: AuthUser = {
  id: 1,
  email: "alivika@dresslive.com",
  full_name: "Alivika Tony",
  is_active: true,
  is_superuser: false,
  role: "buyer",
  boutique_id: null,
};

const demoItems: SidebarNavItem[] = [
  { label: "Overview", href: "/dashboard/overview", icon: Home },
  { label: "Integration", href: "/dashboard/integration", icon: Compass },
  { label: "Plans", href: "/dashboard/plans", icon: FolderKanban },
  { label: "Transactions", href: "/dashboard/transactions", icon: CalendarDays },
  {
    label: "Billing",
    icon: CreditCard,
    items: [
      { label: "Cards", href: "/dashboard/billing/cards" },
      { label: "Checkouts", href: "/dashboard/billing/checkouts" },
      { label: "Payments", href: "/dashboard/billing/payments" },
      { label: "Get paid", href: "/dashboard/billing/get-paid" },
    ],
  },
];

export function SidebarWithSubmenuDemo() {
  return (
    <SidebarWithSubmenu
      pathname="/dashboard/overview"
      user={demoUser}
      roleLabel="Workspace Owner"
      items={demoItems}
      footerItems={[{ label: "Settings", href: "/settings", icon: Settings }]}
      onLogout={() => {}}
    />
  );
}
