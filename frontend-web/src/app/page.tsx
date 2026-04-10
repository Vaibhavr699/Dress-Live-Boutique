import Link from "next/link";

export default function Home() {
  return (
    <div className="page-shell">
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-4 py-4 lg:px-8 lg:py-8">
        <section className="card-surface grid flex-1 rounded-[36px] px-6 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-12 lg:py-12">
          <div className="flex flex-col justify-between pr-0 lg:pr-10">
            <div>
              <p className="pill-label text-black/45">Unified Login Portal</p>
              <h1 className="font-serif-display mt-6 max-w-4xl text-5xl leading-[0.95] tracking-[-0.05em] text-black md:text-6xl lg:text-7xl">
                Dress Live for brides and boutique partners.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-black/55">
                One web app, two role-aware experiences. Buyers discover, shortlist and book. Partners manage boutiques,
                catalog, team and appointments from a desktop-friendly workspace.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <Link
                href="/login?role=buyer"
                className="rounded-[28px] border border-black/10 bg-white/80 p-6 transition hover:-translate-y-0.5 hover:border-black/20"
              >
                <p className="pill-label text-black/45">Buyer Access</p>
                <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">Log in as buyer</h2>
                <p className="mt-3 text-sm leading-6 text-black/55">
                  Browse visible dresses, track bookings, complete payments and manage your fitting journey.
                </p>
              </Link>
              <Link
                href="/login?role=partner"
                className="rounded-[28px] border border-black/10 bg-black p-6 text-white transition hover:-translate-y-0.5"
              >
                <p className="pill-label text-white/60">Partner Access</p>
                <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em]">Log in as partner</h2>
                <p className="mt-3 text-sm leading-6 text-white/70">
                  Manage catalog visibility, bookings, boutique profile and consultant operations from a web dashboard.
                </p>
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:mt-0">
            <div className="rounded-[30px] bg-[#111111] p-6 text-white">
              <p className="pill-label text-white/55">Product Logic</p>
              <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em]">
                Try before you book, decide with a human, purchase with confidence.
              </h3>
              <div className="hero-divider my-6 opacity-30" />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-3xl">01</p>
                  <p className="mt-2 text-sm text-white/70">Discover boutiques and dresses</p>
                </div>
                <div>
                  <p className="text-3xl">02</p>
                  <p className="mt-2 text-sm text-white/70">Shortlist and book an appointment</p>
                </div>
                <div>
                  <p className="text-3xl">03</p>
                  <p className="mt-2 text-sm text-white/70">Consult, decide and complete purchase</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[28px] border border-black/10 bg-white/80 p-6">
                <p className="pill-label text-black/45">New Here?</p>
                <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">Create a buyer account</h3>
                <p className="mt-3 text-sm leading-6 text-black/55">
                  Save favorites, shortlist up to four dresses, book appointments and manage payments.
                </p>
                <Link
                  href="/register?role=buyer"
                  className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm text-white transition hover:bg-black/85"
                >
                  Register as buyer
                </Link>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-[#efe7da] p-6">
                <p className="pill-label text-black/45">Open Your Portal</p>
                <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">Register as boutique partner</h3>
                <p className="mt-3 text-sm leading-6 text-black/55">
                  Set your boutique profile, create your team workspace and access the partner dashboard instantly.
                </p>
                <Link
                  href="/register?role=partner"
                  className="mt-6 inline-flex rounded-full border border-black px-5 py-3 text-sm text-black transition hover:bg-black hover:text-white"
                >
                  Register as partner
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
