import Image from "next/image";
import Link from "next/link";

const portalIcon = "/landing-icon.svg";

const footerLinks = [
  { href: "#experience", label: "Experience" },
  { href: "#journeys", label: "Journeys" },
  { href: "#platform", label: "Platform" },
  { href: "#access", label: "Access" },
];

const accessLinks = [
  { href: "/login?role=buyer", label: "Sign In" },
  { href: "/register?role=buyer", label: "Create Account" },
  { href: "/login?role=partner", label: "Boutique Workspace" },
  { href: "/register?role=partner", label: "Register Boutique" },
];

export function LandingFooter() {
  return (
    <footer className="card-surface border-t border-black/8 px-6 py-10 lg:px-10 lg:py-12">
      <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-white">
              <Image
                src={portalIcon}
                alt="Dress Live icon"
                width={56}
                height={56}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <p className="font-serif-display text-3xl tracking-[-0.04em] text-black">Dress Live</p>
              <p className="pill-label mt-1 text-black/40">Dress of Paris</p>
            </div>
          </div>
          <p className="mt-5 max-w-xl text-sm leading-7 text-black/55">
            A bridal platform for elegant discovery, thoughtful appointments and boutique-led decision-making from first
            impression to final choice.
          </p>
        </div>

        <div>
          <p className="pill-label text-black/40">Navigation</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-black/60">
            {footerLinks.map((item) => (
              <a key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <p className="pill-label text-black/40">Access</p>
          <div className="mt-5 flex flex-col gap-3 text-sm text-black/60">
            {accessLinks.map((item) => (
              <Link key={item.href} href={item.href} className="transition hover:text-black">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="hero-divider my-8" />

      <div className="flex flex-col gap-3 text-xs text-black/45 lg:flex-row lg:items-center lg:justify-between">
        <p>Dress Live. Boutique-led bridal discovery and appointments.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span>Paris-inspired digital bridal experience</span>
          <span>Elegant browsing</span>
          <span>Consultation-first journey</span>
        </div>
      </div>
    </footer>
  );
}
