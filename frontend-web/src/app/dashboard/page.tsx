"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession } from "@/lib/auth";

export default function DashboardEntryPage() {
  const router = useRouter();

  useEffect(() => {
    const session = getStoredSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    router.replace(session.user.role === "partner" ? "/dashboard/partner" : "/dashboard/buyer");
  }, [router]);

  return (
    <div className="page-shell flex min-h-screen items-center justify-center px-6">
      <div className="card-surface rounded-[30px] px-8 py-10 text-center">
        <p className="pill-label text-black/45">Loading Workspace</p>
        <h1 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
          Routing your dashboard
        </h1>
      </div>
    </div>
  );
}
