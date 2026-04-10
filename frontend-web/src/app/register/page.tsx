"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { registerUser } from "@/lib/auth";
import type { UserRole } from "@/types/auth";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="page-shell min-h-screen" />}>
      <RegisterPageContent />
    </Suspense>
  );
}

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const role = useMemo<UserRole>(
    () => (searchParams.get("role") === "partner" ? "partner" : "buyer"),
    [searchParams]
  );

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [boutiqueName, setBoutiqueName] = useState("");
  const [boutiqueLocation, setBoutiqueLocation] = useState("");
  const [boutiqueDescription, setBoutiqueDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (role === "partner" && !boutiqueName.trim()) {
      setError("Partner registration requires a boutique name.");
      return;
    }

    setLoading(true);

    try {
      const session = await registerUser({
        role,
        fullName,
        email,
        password,
        boutiqueInfo:
          role === "partner"
            ? {
                name: boutiqueName.trim(),
                location: boutiqueLocation.trim(),
                description: boutiqueDescription.trim(),
              }
            : undefined,
      });

      router.replace(session.user.role === "partner" ? "/dashboard/partner" : "/dashboard/buyer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell min-h-screen px-4 py-4 lg:px-8 lg:py-8">
      <div className="card-surface mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-[1360px] rounded-[36px] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="px-6 py-8 lg:px-10 lg:py-10">
          <Link href="/" className="font-serif-display text-[30px] tracking-[-0.04em] text-black">
            Dress Live
          </Link>
          <p className="pill-label mt-8 text-black/45">{role === "partner" ? "Partner Registration" : "Buyer Registration"}</p>
          <h1 className="font-serif-display mt-5 text-4xl tracking-[-0.04em] text-black lg:text-5xl">
            {role === "partner" ? "Open your boutique portal." : "Create your buyer account."}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-black/55">
            We use one web app and one auth system. Your selected role is stored in the database and determines the dashboard you enter after registration.
          </p>

          <div className="mt-10 grid gap-4">
            <div className="rounded-[26px] bg-black px-6 py-6 text-white">
              <p className="pill-label text-white/55">What This Unlocks</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
                {role === "partner" ? (
                  <>
                    <li>Manage boutique profile and catalog from a desktop-first workspace.</li>
                    <li>Receive bookings and prepare the fitting journey.</li>
                    <li>Create a partner identity tied to your boutique data.</li>
                  </>
                ) : (
                  <>
                    <li>Browse boutiques and discover visible dresses freely.</li>
                    <li>Save your profile for shortlist, bookings and payments.</li>
                    <li>Continue your fitting journey across mobile and web.</li>
                  </>
                )}
              </ul>
            </div>

            <div className="rounded-[26px] border border-black/10 bg-white/70 px-6 py-6">
              <p className="pill-label text-black/45">Role Summary</p>
              <p className="mt-4 text-sm leading-6 text-black/60">
                {role === "partner"
                  ? "Partner registration creates a user with the partner role and a boutique record in the database."
                  : "Buyer registration creates a user with the buyer role and routes you to the customer workspace."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid-lines border-t border-black/8 px-6 py-8 lg:border-l lg:border-t-0 lg:px-12">
          <form onSubmit={handleSubmit} className="mx-auto w-full max-w-[620px]">
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="pill-label text-black/45">Full Name</span>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                  placeholder={role === "partner" ? "Owner or consultant name" : "Your full name"}
                />
              </label>

              <label className="block">
                <span className="pill-label text-black/45">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                  placeholder="name@example.com"
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
                  placeholder="Create a password"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="pill-label text-black/45">Confirm Password</span>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                  placeholder="Repeat your password"
                />
              </label>

              {role === "partner" ? (
                <>
                  <label className="block md:col-span-2">
                    <span className="pill-label text-black/45">Boutique Name</span>
                    <input
                      type="text"
                      required
                      value={boutiqueName}
                      onChange={(event) => setBoutiqueName(event.target.value)}
                      className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                      placeholder="Parla Weddings"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="pill-label text-black/45">Location</span>
                    <input
                      type="text"
                      value={boutiqueLocation}
                      onChange={(event) => setBoutiqueLocation(event.target.value)}
                      className="mt-3 h-14 w-full border-b border-black/15 bg-transparent text-base outline-none placeholder:text-black/25"
                      placeholder="Paris, France"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="pill-label text-black/45">Boutique Description</span>
                    <textarea
                      value={boutiqueDescription}
                      onChange={(event) => setBoutiqueDescription(event.target.value)}
                      className="mt-3 min-h-[120px] w-full border border-black/10 bg-white/60 px-4 py-4 text-base outline-none placeholder:text-black/25"
                      placeholder="Describe your bridal boutique, style focus and collection."
                    />
                  </label>
                </>
              ) : null}
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
              {loading ? "Creating Account..." : role === "partner" ? "Create Partner Account" : "Create Buyer Account"}
            </button>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-sm text-black/55">
              <Link href={`/login?role=${role}`} className="text-black transition hover:opacity-60">
                Already have an account? Log in
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
