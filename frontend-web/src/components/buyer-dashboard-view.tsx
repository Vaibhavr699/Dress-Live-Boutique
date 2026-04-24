"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthHeaders, getStoredSession } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type Dress = {
  id: number;
  name: string;
  price: number;
  image_url?: string | null;
  boutique_id: number;
};

type Boutique = {
  id: number;
  name: string;
  location?: string | null;
  description?: string | null;
  header_image_url?: string | null;
};

type BoutiqueCard = {
  boutiqueId: number;
  boutiqueName: string;
  boutiqueLocation: string;
  coverImageUrl: string | null;
  matchingDressCount: number;
};

type ShortlistItem = {
  id: number;
  dress_id: number;
  user_id: number;
  created_at: string;
};

type Booking = {
  id: number;
  appointment_type: string;
  status: string;
  scheduled_for: string;
  language: string;
  dress_ids: number[];
};

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M7 2v4M17 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 20s-6.5-4.35-9-8.38C.72 7.86 3 4 6.88 4c2.11 0 3.53 1.05 5.12 3 1.59-1.95 3.01-3 5.12-3C21 4 23.28 7.86 21 11.62 18.5 15.65 12 20 12 20Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="M4 10h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Zm1-6h14l2 4H3l2-4Zm4 10v6m6-6v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="m7 14 5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getRenderableImageSrc(value?: string | null) {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return null;
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  return null;
}

function appointmentLabel(value: string) {
  return value === "video" ? "Video Call" : "In Store Visit";
}

function bookingStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "accepted":
    case "confirmed":
      return {
        badge: "bg-emerald-100 text-emerald-700",
        border: "border-emerald-200",
      };
    case "requested":
    case "pending":
      return {
        badge: "bg-amber-100 text-amber-700",
        border: "border-amber-200",
      };
    case "rejected":
    case "cancelled":
      return {
        badge: "bg-rose-100 text-rose-700",
        border: "border-rose-200",
      };
    default:
      return {
        badge: "bg-slate-100 text-slate-700",
        border: "border-slate-200",
      };
  }
}

type BuyerDashboardPage = "home" | "discover" | "appointments" | "profile";

type BuyerDashboardViewProps = {
  page?: BuyerDashboardPage;
};

const BUYER_PAGE_CONTENT: Record<BuyerDashboardPage, { title: string; subtitle: string }> = {
  home: {
    title: "Buyer Workspace",
    subtitle:
      "Track your bridal journey with a clearer workspace for discovery, shortlisting, booking requests and upcoming boutique conversations.",
  },
  discover: {
    title: "Discover Boutiques",
    subtitle:
      "Browse boutiques and visible dresses in a focused discovery view, then build a shortlist before moving into an appointment.",
  },
  appointments: {
    title: "Appointments",
    subtitle:
      "Create booking requests, review your latest appointment details and keep the next boutique conversation moving forward.",
  },
  profile: {
    title: "Profile & Shortlist",
    subtitle:
      "Review your shortlist, buyer profile essentials and current booking queue from one calmer profile-focused view.",
  },
};

export function BuyerDashboardView({ page = "home" }: BuyerDashboardViewProps) {
  const router = useRouter();
  const session = useMemo(() => getStoredSession(), []);
  const user = session?.user?.role === "buyer" ? session.user : null;
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [boutiques, setBoutiques] = useState<Record<number, Boutique>>({});
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDressId, setSavingDressId] = useState<number | null>(null);
  const [creatingBooking, setCreatingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const [appointmentType, setAppointmentType] = useState<"video" | "in_store">("video");
  const [scheduledFor, setScheduledFor] = useState("Tuesday, 14 May - 10:00 AM");
  const [language, setLanguage] = useState("English");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!session) {
      router.replace("/login?role=buyer");
      return;
    }

    if (session.user.role !== "buyer") {
      router.replace("/dashboard/partner");
      return;
    }

    Promise.all([
      apiRequest<Dress[]>("/dresses/?visible_only=true"),
      apiRequest<Boutique[]>("/boutiques/"),
      apiRequest<ShortlistItem[]>("/shortlists/me", {
        headers: getAuthHeaders(),
      }),
      apiRequest<Booking[]>("/bookings/me", {
        headers: getAuthHeaders(),
      }),
    ])
      .then(([dressData, boutiqueData, shortlistData, bookingsData]) => {
        setDresses(Array.isArray(dressData) ? dressData : []);
        setBoutiques(
          (Array.isArray(boutiqueData) ? boutiqueData : []).reduce<Record<number, Boutique>>(
            (accumulator, boutique) => {
              accumulator[boutique.id] = boutique;
              return accumulator;
            },
            {}
          )
        );
        setShortlist(Array.isArray(shortlistData) ? shortlistData : []);
        setBookings(Array.isArray(bookingsData) ? bookingsData : []);
      })
      .finally(() => setLoading(false));
  }, [router, session]);

  const shortlistDressIds = useMemo(() => shortlist.map((item) => item.dress_id), [shortlist]);
  const shortlistedDresses = useMemo(
    () => dresses.filter((dress) => shortlistDressIds.includes(dress.id)),
    [dresses, shortlistDressIds]
  );
  const latestBooking = bookings[0] ?? null;
  const visibleDresses = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return dresses;
    }

    return dresses.filter((dress) => {
      const boutique = boutiques[dress.boutique_id];
      const searchableText = [dress.name, boutique?.name, boutique?.location, boutique?.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [boutiques, dresses, searchQuery]);
  const boutiqueCards = useMemo(() => {
    const grouped = new Map<number, { cover: string | null; count: number }>();

    for (const dress of visibleDresses) {
      const boutiqueId = dress.boutique_id;
      if (!boutiqueId) continue;

      const previous = grouped.get(boutiqueId);
      const nextCover = previous?.cover || dress.image_url || null;
      grouped.set(boutiqueId, {
        cover: nextCover,
        count: (previous?.count || 0) + 1,
      });
    }

    const cards: BoutiqueCard[] = [];
    for (const [boutiqueId, meta] of grouped.entries()) {
      const boutique = boutiques[boutiqueId];
      if (!boutique) continue;

      cards.push({
        boutiqueId,
        boutiqueName: (boutique.name || "").trim() || "Boutique",
        boutiqueLocation: (boutique.location || "").trim() || "Location unavailable",
        coverImageUrl: (boutique.header_image_url || "").trim() || meta.cover || null,
        matchingDressCount: meta.count,
      });
    }

    cards.sort((a, b) => a.boutiqueName.localeCompare(b.boutiqueName));
    return cards;
  }, [boutiques, visibleDresses]);
  const featuredDresses = useMemo(() => visibleDresses.slice(0, 6), [visibleDresses]);

  const toggleShortlist = async (dress: Dress) => {
    if (!user) {
      return;
    }

    setBookingError(null);
    setBookingSuccess(null);
    setSavingDressId(dress.id);

    try {
      const existing = shortlist.find((item) => item.dress_id === dress.id);

      if (existing) {
        await apiRequest<{ success: boolean }>(`/shortlists/me/${dress.id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        setShortlist((current) => current.filter((item) => item.dress_id !== dress.id));
        return;
      }

      if (shortlist.length > 0 && !shortlistDressIds.includes(dress.id)) {
        const existingBoutique = shortlistedDresses[0]?.boutique_id;
        if (existingBoutique && existingBoutique !== dress.boutique_id) {
          setBookingError("For booking basics, shortlist dresses from one boutique at a time.");
          return;
        }
      }

      const created = await apiRequest<ShortlistItem>("/shortlists/me", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ dress_id: dress.id }),
      });
      setShortlist((current) => [created, ...current]);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Could not update shortlist.");
    } finally {
      setSavingDressId(null);
    }
  };

  const handleCreateBooking = async () => {
    setBookingError(null);
    setBookingSuccess(null);

    if (shortlistedDresses.length === 0) {
      setBookingError("Add at least one dress to your shortlist before booking.");
      return;
    }

    setCreatingBooking(true);
    try {
      const created = await apiRequest<Booking>("/bookings", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          appointment_type: appointmentType,
          scheduled_for: scheduledFor,
          language,
          dress_ids: shortlistedDresses.map((dress) => dress.id),
          appointment_fee: 49.9,
          is_paid: false,
        }),
      });
      setBookings((current) => [created, ...current]);
      setBookingSuccess("Booking request created successfully.");
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : "Could not create booking.");
    } finally {
      setCreatingBooking(false);
    }
  };

  if (!user) {
    return null;
  }

  const pageContent = BUYER_PAGE_CONTENT[page];
  const showOverview = page === "home" || page === "appointments";
  const showDiscover = page === "home" || page === "discover";
  const showProfile = page === "home" || page === "profile";

  return (
    <DashboardShell
      user={user}
      role="buyer"
      title={pageContent.title}
      subtitle={pageContent.subtitle}
      headerActions={
        <div className="flex h-12 w-full items-center gap-3 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-500 shadow-sm lg:min-w-[380px]">
          <SearchIcon />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search boutiques, dresses, locations"
            className="w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-400"
          />
        </div>
      }
    >
      {showOverview ? (
        <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,#0F172A_0%,#111827_52%,#1D4ED8_100%)] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <p className="pill-label text-white/55">Buyer Overview</p>
              <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] lg:text-4xl">
                A calmer workspace for discovery, shortlisting and boutique appointments.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/72">
                Keep your bridal journey organised with a clearer overview of available dresses, shortlisted looks and current booking activity.
              </p>
            </div>

            <div className="rounded-[22px] border border-white/12 bg-white/8 px-4 py-4 backdrop-blur-sm">
              <p className="pill-label text-white/55">Latest Request</p>
              <p className="mt-3 text-base font-medium text-white">
                {latestBooking ? appointmentLabel(latestBooking.appointment_type) : "No bookings yet"}
              </p>
              <p className="mt-1 text-sm text-white/65">
                {latestBooking ? latestBooking.scheduled_for : "Create your first request from the booking panel."}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/12 text-white">
                  <SparkIcon />
                </span>
                <span className="flex items-center gap-1 text-xs text-emerald-200">
                  <ArrowUpIcon />
                  Live
                </span>
              </div>
              <p className="mt-6 text-3xl font-medium">{dresses.length}</p>
              <p className="mt-2 text-sm text-white/70">Visible dresses available now</p>
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-400/18 text-rose-100">
                  <HeartIcon />
                </span>
                <span className="text-xs text-white/55">Up to 4</span>
              </div>
              <p className="mt-6 text-3xl font-medium">{shortlist.length}</p>
              <p className="mt-2 text-sm text-white/70">Dresses in your current shortlist</p>
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/18 text-sky-100">
                  <CalendarIcon />
                </span>
                <span className="text-xs text-white/55">Active</span>
              </div>
              <p className="mt-6 text-3xl font-medium">{bookings.length}</p>
              <p className="mt-2 text-sm text-white/70">Bookings linked to your account</p>
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/18 text-amber-100">
                  <StoreIcon />
                </span>
                <span className="text-xs text-white/55">Connected</span>
              </div>
              <p className="mt-6 text-3xl font-medium">{boutiqueCards.length || Object.keys(boutiques).length}</p>
              <p className="mt-2 text-sm text-white/70">Boutiques represented in your current view</p>
            </div>
          </div>
        </div>

        <div id="appointments" className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
              <CalendarIcon />
            </span>
            <div>
              <p className="pill-label text-black/45">Appointment Studio</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Create a booking request</h2>
            </div>
          </div>

          <div className="mt-6 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
            <ul className="space-y-3 text-sm leading-6 text-slate-600">
              <li>Shortlist up to four dresses from one boutique.</li>
              <li>Select video call or in-store fitting.</li>
              <li>Keep one preferred slot and one consultation language.</li>
              <li>Submit when your shortlist feels ready.</li>
            </ul>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="pill-label text-black/45">Appointment Type</span>
              <select
                value={appointmentType}
                onChange={(event) => setAppointmentType(event.target.value as "video" | "in_store")}
                className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none"
              >
                <option value="video">Video Call</option>
                <option value="in_store">In Store Visit</option>
              </select>
            </label>

            <label className="block">
              <span className="pill-label text-black/45">Preferred Slot</span>
              <input
                type="text"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none"
              />
            </label>

            <label className="block">
              <span className="pill-label text-black/45">Language</span>
              <input
                type="text"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-slate-900 outline-none"
              />
            </label>

            <button
              type="button"
              onClick={handleCreateBooking}
              disabled={creatingBooking}
              className="mt-2 rounded-full bg-slate-900 px-5 py-4 text-sm uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {creatingBooking ? "Submitting..." : "Create Booking Request"}
            </button>

            {bookingError ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {bookingError}
              </p>
            ) : null}

            {bookingSuccess ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {bookingSuccess}
              </p>
            ) : null}
          </div>
        </div>
        </section>
      ) : null}

      {showDiscover ? (
        <section
          id="discover"
          className={`${showOverview ? "mt-8 " : ""}rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]`}
        >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="pill-label text-black/45">Home Feed</p>
            <h2 className="font-serif-display mt-3 text-3xl tracking-[-0.04em] text-slate-900">
              Explore boutiques first
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
              This default view mirrors the boutique-first browsing flow from the app, so you start with boutiques and then move into their available looks.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
            <SparkIcon />
            {boutiqueCards.length} boutique{boutiqueCards.length === 1 ? "" : "s"} available
          </div>
        </div>

        {loading ? (
          <div className="mt-10 text-sm text-black/45">Loading boutiques...</div>
        ) : boutiqueCards.length === 0 ? (
          <div className="mt-10 rounded-[24px] border border-dashed border-black/15 px-6 py-10 text-sm text-black/55">
            No boutiques matched the current search. Try a different boutique, dress or location keyword.
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {boutiqueCards.map((card) => (
                <article
                  key={card.boutiqueId}
                  className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf7f2_100%)] shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
                >
                  <div className="relative h-[240px] overflow-hidden bg-slate-100">
                    {getRenderableImageSrc(card.coverImageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getRenderableImageSrc(card.coverImageUrl) || ""}
                        alt={card.boutiqueName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-[linear-gradient(135deg,#efe5d6,#dcc4a6)]" />
                    )}
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.06)_0%,rgba(15,23,42,0.55)_100%)]" />
                    <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                      <div className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
                        {card.matchingDressCount} dress{card.matchingDressCount === 1 ? "" : "es"} available
                      </div>
                      <h3 className="mt-4 text-xl font-semibold">{card.boutiqueName}</h3>
                      <p className="mt-2 text-sm text-white/80">{card.boutiqueLocation}</p>
                    </div>
                  </div>

                  <div className="p-5">
                    <p className="text-sm leading-6 text-slate-500">
                      Browse this boutique&apos;s current visible selection and build a shortlist before requesting your appointment.
                    </p>
                  </div>
                </article>
              ))}
            </div>

            <div className="hero-divider my-8" />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="pill-label text-black/45">Available Styles</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-900">
                  Dresses you can shortlist now
                </h3>
              </div>
              <p className="max-w-xl text-sm leading-6 text-slate-500">
                Use the top search bar to narrow boutiques and dresses together. Your shortlist still stays limited to one boutique per booking request.
              </p>
            </div>

            {featuredDresses.length === 0 ? (
              <div className="mt-8 rounded-[24px] border border-dashed border-slate-200 px-6 py-10 text-sm text-slate-500">
                No dresses matched the current search.
              </div>
            ) : (
              <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {featuredDresses.map((dress) => {
                  const boutique = boutiques[dress.boutique_id];
                  const shortlisted = shortlistDressIds.includes(dress.id);
                  return (
                    <article
                      key={dress.id}
                      className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#faf7f2_100%)] shadow-[0_12px_30px_rgba(15,23,42,0.04)]"
                    >
                      <div className="relative h-[240px] overflow-hidden bg-slate-100">
                        {getRenderableImageSrc(dress.image_url) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={getRenderableImageSrc(dress.image_url) || ""}
                            alt={dress.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full bg-[linear-gradient(135deg,#f3eadc,#e7d8c2)]" />
                        )}
                        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700 backdrop-blur-sm">
                          {boutique?.name || "Boutique Partner"}
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900">{dress.name}</h3>
                            <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                              <StoreIcon />
                              {boutique?.location || "Location unavailable"}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {typeof dress.price === "number" ? `${dress.price.toFixed(0)} EUR` : "Price on request"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleShortlist(dress)}
                          disabled={savingDressId === dress.id}
                          className={`mt-6 w-full rounded-full px-4 py-3 text-sm font-medium transition ${
                            shortlisted
                              ? "border border-slate-900 bg-transparent text-slate-900 hover:bg-slate-900 hover:text-white"
                              : "bg-slate-900 text-white hover:bg-slate-800"
                          }`}
                        >
                          {savingDressId === dress.id
                            ? "Updating..."
                            : shortlisted
                              ? "Remove from shortlist"
                              : "Add to shortlist"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
        </section>
      ) : null}

      {showProfile ? (
        <section
          id="profile"
          className={`${showOverview || showDiscover ? "mt-8 " : ""}grid gap-4 xl:grid-cols-[0.9fr_1.1fr_1fr]`}
        >
        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <HeartIcon />
            </span>
            <div>
              <p className="pill-label text-black/45">Shortlist</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">{shortlistedDresses.length} dresses ready</h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {shortlistedDresses.length === 0 ? (
              <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm leading-6 text-slate-500">
                Your shortlist is empty. Add dresses from the catalog to prepare your next booking request.
              </p>
            ) : (
              shortlistedDresses.map((dress) => (
                <div key={dress.id} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">{dress.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {boutiques[dress.boutique_id]?.name || "Boutique Partner"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#F8FAFC_0%,#EEF2FF_100%)] p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <UserIcon />
            </span>
            <div>
              <p className="pill-label text-black/45">Profile Summary</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Buyer profile essentials</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm text-slate-700">
            <div className="rounded-[22px] border border-white/60 bg-white/70 p-4">
              <p className="pill-label text-black/35">Account Name</p>
              <p className="mt-2 text-base font-medium text-slate-900">{user.full_name || "Unnamed Buyer"}</p>
            </div>
            <div className="rounded-[22px] border border-white/60 bg-white/70 p-4">
              <p className="pill-label text-black/35">Email</p>
              <p className="mt-2 text-base font-medium text-slate-900">{user.email}</p>
            </div>
            <div className="rounded-[22px] border border-white/60 bg-white/70 p-4">
              <p className="pill-label text-black/35">Journey Focus</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Continue discovering dresses, then convert your shortlist into a boutique appointment when ready.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <CalendarIcon />
            </span>
            <div>
              <p className="pill-label text-black/45">Booking Queue</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-900">Current booking requests</h2>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {bookings.length === 0 ? (
              <p className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm leading-6 text-slate-500">
                No bookings yet. Create one from your shortlist using the appointment panel above.
              </p>
            ) : (
              bookings.slice(0, 4).map((booking) => {
                const tone = bookingStatusTone(booking.status);
                return (
                  <div key={booking.id} className={`rounded-[22px] border ${tone.border} bg-slate-50/80 p-4`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{appointmentLabel(booking.appointment_type)}</p>
                      <span className={`rounded-full px-3 py-1 text-[11px] font-medium ${tone.badge}`}>{booking.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{booking.scheduled_for}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {booking.language} • {booking.dress_ids.length} shortlisted dress(es)
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
