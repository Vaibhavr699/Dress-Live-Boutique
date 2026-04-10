"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { loginWithCredentials } from "@/lib/auth";
import type { UserRole } from "@/types/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page-shell min-h-screen" />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const role = useMemo<UserRole>(
    () => (searchParams.get("role") === "partner" ? "partner" : "buyer"),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const session = await loginWithCredentials(email, password);
      const nextRoute =
        session.user.role === "partner" ? "/dashboard/partner" : "/dashboard/buyer";
      router.replace(nextRoute);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell min-h-screen px-4 py-4 lg:px-8 lg:py-8">
      <div className="card-surface mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1320px] rounded-[36px] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="flex flex-col justify-between bg-[#111111] px-6 py-8 text-white lg:px-10 lg:py-10">
          <div>
            <Link href="/" className="font-serif-display text-[30px] tracking-[-0.04em]">
              Dress Live
            </Link>
            <p className="pill-label mt-8 text-white/55">
              {role === "partner" ? "Partner Sign In" : "Buyer Sign In"}
            </p>
            <h1 className="font-serif-display mt-5 text-4xl tracking-[-0.05em] lg:text-5xl">
              {role === "partner"
                ? "Welcome back to your boutique workspace."
                : "Welcome back to your fitting journey."}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/70">
              Enter your credentials and we will automatically route you to the correct dashboard based on your role in the system.
            </p>
          </div>

          <div className="rounded-[26px] border border-white/12 bg-white/6 p-5">
            <p className="pill-label text-white/55">Role Aware Access</p>
            <p className="mt-3 text-sm leading-6 text-white/75">
              The role you choose here sets the visual context, but your actual dashboard is determined by the role stored in the database after login.
            </p>
          </div>
        </div>

        <div className="grid-lines flex items-center px-6 py-8 lg:px-12">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[520px]">
            <p className="pill-label text-black/45">{role === "partner" ? "Partner Login" : "Buyer Login"}</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">Add your log in info</h2>
            <p className="mt-4 text-sm leading-7 text-black/55">
              Use the same credentials you use in the mobile apps. After authentication, your role decides your destination automatically.
            </p>

            <div className="mt-10 space-y-6">
              <label className="block">
                <span className="pill-label text-black/45">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                  placeholder="Enter your email"
                />
              </label>

              <label className="block">
                <span className="pill-label text-black/45">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                  placeholder="Enter your password"
                />
              </label>
            </div>

            {error ? (
              <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-10 w-full rounded-full bg-black px-6 py-4 text-sm uppercase tracking-[0.2em] text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/40"
            >
              {loading ? "Signing In..." : "Log In"}
            </button>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-black/55">
              <Link href={`/register?role=${role}`} className="text-black transition hover:opacity-60">
                No account? Create one
              </Link>
              <Link href="/" className="transition hover:opacity-60">
                Back to landing page
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
