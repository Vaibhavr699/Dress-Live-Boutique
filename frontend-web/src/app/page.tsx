import Link from "next/link";
import Image from "next/image";

import boutiqueExperienceImage from "../../assets/images/boutique-experience.png";
import boutiqueIpadCouchImage from "../../assets/images/boutique-ipad-couch.png";
import dashboardHeroImage from "../../assets/images/Dashboard image 1.png";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNavbar } from "@/components/landing-navbar";

const blackButtonClass =
  "inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-black/85 hover:text-white";

const outlineButtonClass =
  "group inline-flex rounded-full border border-black px-5 py-3 text-sm text-black transition hover:bg-black";

const stats = [
  { value: "Curated", label: "Boutique-led bridal discovery designed around real appointments" },
  { value: "Guided", label: "A journey from browsing and shortlisting to consultation and purchase" },
  { value: "Connected", label: "Catalog, bookings and boutique operations working inside one product" },
];

const experienceCards = [
  {
    title: "Discover curated boutiques",
    body: "Browse visible collections, compare dresses and shortlist the options that feel right before you commit to a fitting.",
  },
  {
    title: "Book with context",
    body: "Appointments stay tied to the dresses, boutique and timing you selected, making every consultation more relevant.",
  },
  {
    title: "Support both self-serve and guided sales",
    body: "The platform blends elegant browsing with the operational tools boutiques need to manage inquiries, availability and dress visibility.",
  },
];

const buyerJourney = [
  "Discover boutiques and visible dresses",
  "Shortlist favorite looks and request an appointment",
  "Join video or in-store consultation with full booking context",
  "Confirm the right dress with more confidence",
];

const partnerJourney = [
  "Set up boutique profile, location and visibility",
  "Manage catalog, dress readiness and buyer inquiries",
  "Track appointments and booking changes in one workspace",
  "Move consultations toward purchase with a clearer operating flow",
];

const platformHighlights = [
  {
    title: "Boutique-led discovery",
    body: "Dress Live is built around bridal decision-making, where catalog browsing leads naturally into appointments and human guidance.",
  },
  {
    title: "Boutique-first operations",
    body: "Catalog visibility, team workflow, booking handling and profile management stay centered around the boutique.",
  },
  {
    title: "Try-before-book mindset",
    body: "The product direction supports AI try-on, shortlisting and consultation-first shopping instead of a blind checkout flow.",
  },
];

export default function Home() {
  return (
    <div className="page-shell ">
      <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col">
        <LandingNavbar />

        <div className="flex flex-col gap-6">
        <section className="card-surface">
          <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-10">
            <div className="flex flex-col justify-between">
            <div>
                <p className="pill-label text-black/45">Modern Bridal Commerce Experience</p>
                <h1 className="font-serif-display mt-6 max-w-4xl text-5xl leading-[0.92] tracking-[-0.05em] text-black md:text-6xl lg:text-7xl">
                  Discover dresses, book meaningful appointments and move with confidence toward the right choice.
              </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-black/55 lg:text-lg">
                  Dress Live is a bridal platform that connects elegant dress discovery with real boutique guidance.
                  Instead of treating bridal shopping like generic ecommerce, it supports shortlisting, consultation,
                  booking and boutique-led decision-making in one connected experience.
              </p>
            </div>

              <div className="mt-10 flex flex-wrap gap-4">
              <Link
                  href="/register?role=buyer"
                  className={blackButtonClass}
                  style={{ color: "#FFFFFF" }}
                >
                  Start Your Journey
              </Link>
              <Link
                  href="/register?role=partner"
                  className={`${outlineButtonClass} px-6`}
                >
                  <span className="transition-colors duration-300 group-hover:text-white">List Your Boutique</span>
              </Link>
              </div>

              <div className="mt-10 grid gap-4 md:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.value} className="rounded-[24px] border border-black/10 bg-white/70 p-5">
                    <p className="font-serif-display text-3xl tracking-[-0.04em] text-black">{stat.value}</p>
                    <p className="mt-2 text-sm leading-6 text-black/55">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="relative overflow-hidden rounded-[32px] bg-[#111111] text-white">
                <Image
                  src={dashboardHeroImage}
                  alt="Boutique interior hero"
                  width={1024}
                  height={683}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="h-[320px] w-full object-cover opacity-55 lg:h-[430px]"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                  <p className="pill-label text-white/60">Signature Experience</p>
                  <h2 className="font-serif-display mt-4 max-w-xl text-3xl tracking-[-0.04em] lg:text-4xl">
                    Try before you book, then buy with a real boutique conversation behind every decision.
                  </h2>
                  <p className="mt-4 max-w-lg text-sm leading-6 text-white/72">
                    Built for premium bridal browsing, thoughtful appointments and high-intent consultations rather than
                    a simple storefront checkout.
                  </p>
            </div>
          </div>

              <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[28px] border border-black/10 bg-[#111111] p-6 text-white">
              <p className="pill-label text-white/55">Product Logic</p>
              <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em]">
                    Discover. Shortlist. Book. Decide.
              </h3>
              <div className="hero-divider my-6 opacity-30" />
                  <div className="grid gap-4">
                <div>
                  <p className="text-3xl">01</p>
                      <p className="mt-2 text-sm text-white/70">Find boutiques and visible collections</p>
                    </div>
                    <div>
                      <p className="text-3xl">02</p>
                      <p className="mt-2 text-sm text-white/70">Book a meaningful appointment with context</p>
                    </div>
                    <div>
                      <p className="text-3xl">03</p>
                      <p className="mt-2 text-sm text-white/70">Convert with guided human support</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white/80">
                  <Image
                    src={boutiqueExperienceImage}
                    alt="Boutique consultation experience"
                    width={1024}
                    height={1024}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="h-[260px] w-full object-cover"
                  />
                  <div className="p-6">
                    <p className="pill-label text-black/45">Boutique Experience</p>
                    <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
                      Built for premium bridal journeys, not just product listings.
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-black/55">
                      The portal frames each dress around boutique identity, consultation flow and purchase readiness so
                      the experience feels intentional from the first click.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="experience" className="grid gap-6 px-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="card-surface rounded-[32px] p-6 lg:p-8">
            <p className="pill-label text-black/45">Why It Feels Better</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">
              A clearer digital experience for modern bridal shopping.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-black/55 lg:text-base">
              Dress Live is designed around how bridal decisions actually happen: discover inspiring dresses, shortlist
              serious options, book consultations and move forward with boutique support at the right moment.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {experienceCards.map((card) => (
              <article key={card.title} className="card-surface rounded-[28px] p-6">
                <p className="pill-label text-black/45">Experience</p>
                <h3 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">{card.title}</h3>
                <p className="mt-4 text-sm leading-6 text-black/55">{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="journeys" className="grid gap-6 lg:grid-cols-2 px-6">
          <article className="card-surface rounded-[32px] p-6 lg:p-8">
            <p className="pill-label text-black/45">Client Journey</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">Made for brides</h2>
            <p className="mt-4 text-sm leading-7 text-black/55">
              Buyers get a calmer path from discovery to appointment without losing the boutique relationship that makes
              bridal shopping more trustworthy.
            </p>
            <div className="mt-8 grid gap-4">
              {buyerJourney.map((item, index) => (
                <div key={item} className="flex gap-4 rounded-[24px] border border-black/10 bg-white/70 p-4">
                  <span className="font-serif-display text-2xl tracking-[-0.04em] text-black">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-sm leading-6 text-black/60">{item}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="card-surface rounded-[32px] bg-[#111111] p-6 text-black lg:p-8">
            <p className="pill-label text-black/45">Boutique Workflow</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">Made for boutique operations</h2>
            <p className="mt-4 text-sm leading-7 text-black/55">
              Boutique teams work from a dedicated workspace built around boutique identity, catalog control and appointment
              management rather than ad hoc admin screens.
            </p>
            <div className="mt-8 grid gap-4">
              {partnerJourney.map((item, index) => (
                <div key={item} className="rounded-[24px] border border-black/10 bg-white/70 p-4">
                  <p className="pill-label text-black/45">Step {index + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-black/55">{item}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section id="platform" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] px-6">
          <div className="card-surface rounded-[32px] p-6 lg:p-8">
            <p className="pill-label text-black/45">Platform Highlights</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">
              A stronger digital layer for boutique-led bridal commerce.
            </h2>
            <div className="mt-8 grid gap-4">
              {platformHighlights.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-black/10 bg-white/70 p-5">
                  <h3 className="font-serif-display text-3xl tracking-[-0.04em] text-black">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-black/55">{item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface overflow-hidden rounded-[32px] border border-black/10 bg-[#efe7da]">
            <div className="relative h-[280px] w-full overflow-hidden border-b border-black/8">
              <Image
                src={boutiqueIpadCouchImage}
                alt="Boutique display scene"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/55 to-transparent" />
            </div>
            <div className="p-6 lg:p-8">
              <p className="pill-label text-black/45">Product Direction</p>
              <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">
                Designed to support AI try-on and consultation-led conversion.
              </h2>
              <p className="mt-4 text-sm leading-7 text-black/58">
                The platform direction already supports AI garment readiness, shortlisting logic and structured booking
                flows, making the landing page feel connected to the actual product roadmap.
              </p>
              <div className="hero-divider my-6" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="pill-label text-black/40">For Buyers</p>
                  <p className="mt-2 text-sm leading-6 text-black/60">
                    Better decision-making before the appointment and more clarity during the purchase journey.
                  </p>
                </div>
                <div>
                  <p className="pill-label text-black/40">For Partners</p>
                  <p className="mt-2 text-sm leading-6 text-black/60">
                    Better asset readiness, better booking context and a more premium web presence.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="access" className="grid gap-6 lg:grid-cols-2 px-6">
          <div className="card-surface rounded-[32px] p-6 lg:p-8">
            <p className="pill-label text-black/45">Start Exploring</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">Create your account</h2>
            <p className="mt-4 text-sm leading-7 text-black/55">
              Save favorites, manage bookings, keep your shortlist and move through the bridal journey with your
              boutique context intact.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register?role=buyer"
                className={blackButtonClass}
                style={{ color: "#FFFFFF" }}
              >
                Create account
              </Link>
              <Link
                href="/login?role=buyer"
                className={outlineButtonClass}
              >
                <span className="transition-colors duration-300 group-hover:text-white">Sign in</span>
                </Link>
            </div>
              </div>

          <div className="card-surface rounded-[32px] bg-[#111111] p-6 text-black lg:p-8">
            <p className="pill-label text-black/45">For Boutiques</p>
            <h2 className="font-serif-display mt-4 text-4xl tracking-[-0.04em] text-black">Bring your boutique online</h2>
            <p className="mt-4 text-sm leading-7 text-black/55">
              Open your boutique portal, organize visibility and appointments, and operate from a web dashboard that
              reflects the boutique side of the business.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register?role=partner"
                className={blackButtonClass}
                style={{ color: "#FFFFFF" }}
              >
                Register boutique
              </Link>
              <Link
                href="/login?role=partner"
                className="group inline-flex rounded-full border border-white/25 px-5 py-3 text-sm text-white transition hover:bg-white"
              >
                <span className="transition-colors duration-300 group-hover:text-black">Open workspace</span>
                </Link>
            </div>
          </div>
        </section>

        <LandingFooter />
        </div>
      </main>
    </div>
  );
}
