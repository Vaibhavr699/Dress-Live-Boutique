import Image from "next/image";
import Link from "next/link";

const portalIcon = "/landing-icon.svg";

const navigationItems = [
  { href: "#experience", label: "Experience" },
  { href: "#journeys", label: "Journeys" },
  { href: "#platform", label: "Platform" },
  { href: "#access", label: "Access" },
];

const blackButtonClass =
  "inline-flex rounded-full bg-black px-4 py-2.5 text-sm font-medium text-white transition hover:bg-black/85 hover:text-white";

export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/8 flex flex-col gap-5 bg-[rgba(255,253,248,0.92)] px-6 py-2 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between lg:px-10">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center overflow-hidden">
          <Image
            src={portalIcon}
            alt="Dress Live icon"
            width={44}
            height={44}
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <p className="font-serif-display text-[28px] tracking-[-0.04em] text-black">Dress Live</p>
          <p className="pill-label text-black/40">Bridal Discovery Platform</p>
        </div>
      </Link>

      <nav className="flex flex-wrap items-center gap-4 text-sm text-black/55 lg:justify-center">
        {navigationItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="group relative inline-flex py-1 text-black/55 transition-colors duration-300 hover:text-black"
          >
            <span className="transition-colors duration-300 group-hover:text-black">{item.label}</span>
            <span className="pointer-events-none absolute left-1/2 bottom-0 h-px w-0 -translate-x-1/2 bg-black transition-all duration-300 group-hover:w-full" />
          </a>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/login?role=buyer"
          className="inline-flex rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm text-black transition hover:border-black/20"
        >
          Sign In
        </Link>
        <Link href="/login?role=partner" className={blackButtonClass} style={{ color: "#FFFFFF" }}>
          Boutique Workspace
        </Link>
      </div>
    </header>
  );
}
