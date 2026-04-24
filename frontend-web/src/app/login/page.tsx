"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";

import boutiqueExperienceImage from "../../../assets/images/boutique-experience.png";
import dashboardHeroImage from "../../../assets/images/Dashboard image 1.png";

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
    <div className="page-shell min-h-screen px-4 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full items-center justify-center">
        <div className="card-surface grid min-h-[70vh] w-full max-w-[1120px] overflow-hidden rounded-[32px] lg:grid-cols-[0.95fr_1.05fr]">
        <div className="relative flex min-h-[320px] flex-col justify-between bg-[#111111] px-6 py-8 text-white lg:px-10 lg:py-10">
          <Image
            src={role === "partner" ? boutiqueExperienceImage : dashboardHeroImage}
            alt={role === "partner" ? "Boutique workspace" : "Bridal editorial"}
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover opacity-30"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />

          <div className="relative z-10">
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
            <p className="mt-5 max-w-xl text-sm leading-7 text-white/72">
              Sign in to continue your bridal journey, manage appointments, and access the same connected experience across web and mobile.
            </p>
          </div>

          <div className="relative z-10 rounded-[26px] border border-white/12 bg-white/8 p-5 backdrop-blur-sm">
            <p className="pill-label text-white/55">{role === "partner" ? "Boutique Mode" : "Client Access"}</p>
            <p className="mt-3 text-sm leading-6 text-white/78">
              {role === "partner"
                ? "Open bookings, manage boutique workflow and continue operating from your desktop workspace."
                : "Pick up where you left off with saved dresses, bookings and boutique conversations."}
            </p>
          </div>
        </div>

        <div className="grid-lines flex items-center px-6 py-8 lg:px-12 lg:py-10">
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
    </div>
  );
}
