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

export function BuyerDashboardView() {
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

  const featuredDresses = useMemo(() => dresses.slice(0, 6), [dresses]);
  const shortlistDressIds = useMemo(() => shortlist.map((item) => item.dress_id), [shortlist]);
  const shortlistedDresses = useMemo(
    () => dresses.filter((dress) => shortlistDressIds.includes(dress.id)),
    [dresses, shortlistDressIds]
  );

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

  return (
    <DashboardShell
      user={user}
      role="buyer"
      title="Buyer Dashboard"
      subtitle="Browse visible boutique collections, continue your shortlist flow and prepare for appointments from a web-first control room."
    >
      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] bg-black px-6 py-6 text-white">
          <p className="pill-label text-white/55">Journey Status</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em]">
            Discover boutiques, shortlist up to four dresses, then book with confidence.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-white/10 bg-white/8 p-4">
              <p className="text-3xl">{dresses.length}</p>
              <p className="mt-2 text-sm text-white/70">Visible dresses available now</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/8 p-4">
              <p className="text-3xl">{shortlist.length}</p>
              <p className="mt-2 text-sm text-white/70">Maximum dresses per appointment</p>
            </div>
            <div className="rounded-[22px] border border-white/10 bg-white/8 p-4">
              <p className="text-3xl">{bookings.length}</p>
              <p className="mt-2 text-sm text-white/70">Bookings created in your account</p>
            </div>
          </div>
        </div>

        <div id="appointments" className="rounded-[28px] border border-black/10 bg-white/75 p-6">
          <p className="pill-label text-black/45">Appointments</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            Booking basics to complete next
          </h2>
          <ul className="mt-6 space-y-4 text-sm leading-6 text-black/60">
            <li>Choose up to four dresses from the same boutique.</li>
            <li>Select video call or in-store fitting.</li>
            <li>Pay the appointment fee before confirmation.</li>
            <li>Return later for measurements and final order follow-up.</li>
          </ul>

          <div className="mt-8 grid gap-4">
            <label className="block">
              <span className="pill-label text-black/45">Appointment Type</span>
              <select
                value={appointmentType}
                onChange={(event) => setAppointmentType(event.target.value as "video" | "in_store")}
                className="mt-3 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
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
                className="mt-3 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
              />
            </label>

            <label className="block">
              <span className="pill-label text-black/45">Language</span>
              <input
                type="text"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 outline-none"
              />
            </label>

            <button
              type="button"
              onClick={handleCreateBooking}
              disabled={creatingBooking}
              className="mt-2 rounded-full bg-black px-5 py-4 text-sm uppercase tracking-[0.18em] text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/40"
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

      <section id="discover" className="mt-8 rounded-[30px] border border-black/10 bg-white/75 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="pill-label text-black/45">Visible Catalog</p>
            <h2 className="font-serif-display mt-3 text-3xl tracking-[-0.04em] text-black">
              Discover boutique dresses
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-black/55">
            This feed is already powered by the shared `dresses` and `boutiques` APIs, so the buyer web app stays aligned with the mobile customer experience.
          </p>
        </div>

        {loading ? (
          <div className="mt-10 text-sm text-black/45">Loading visible dresses...</div>
        ) : featuredDresses.length === 0 ? (
          <div className="mt-10 rounded-[24px] border border-dashed border-black/15 px-6 py-10 text-sm text-black/55">
            No visible dresses yet. Boutiques will appear here after partner catalog visibility is enabled.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredDresses.map((dress) => {
              const boutique = boutiques[dress.boutique_id];
              return (
                <article key={dress.id} className="rounded-[26px] border border-black/10 bg-[#fffaf3] p-5">
                  <div className="h-[220px] rounded-[22px] bg-[linear-gradient(135deg,#f3eadc,#e7d8c2)]" />
                  <h3 className="mt-5 text-lg font-medium text-black">{dress.name}</h3>
                  <p className="mt-2 text-sm text-black/55">{boutique?.name || "Boutique Partner"}</p>
                  <div className="mt-6 flex items-center justify-between text-sm text-black/60">
                    <span>{boutique?.location || "Location unavailable"}</span>
                    <span className="font-medium text-black">
                      {typeof dress.price === "number" ? `${dress.price.toFixed(0)} EUR` : "Price on request"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleShortlist(dress)}
                    disabled={savingDressId === dress.id}
                    className={`mt-6 w-full rounded-full px-4 py-3 text-sm transition ${
                      shortlistDressIds.includes(dress.id)
                        ? "border border-black bg-transparent text-black hover:bg-black hover:text-white"
                        : "bg-black text-white hover:bg-black/85"
                    }`}
                  >
                    {savingDressId === dress.id
                      ? "Updating..."
                      : shortlistDressIds.includes(dress.id)
                        ? "Remove from shortlist"
                        : "Add to shortlist"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="profile" className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[28px] border border-black/10 bg-white/75 p-6 lg:col-span-1">
          <p className="pill-label text-black/45">Your Shortlist</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            {shortlistedDresses.length} dresses ready
          </h2>
          <div className="mt-6 space-y-3">
            {shortlistedDresses.length === 0 ? (
              <p className="text-sm leading-6 text-black/55">
                Your shortlist is empty. Add dresses from the catalog to create a booking request.
              </p>
            ) : (
              shortlistedDresses.map((dress) => (
                <div key={dress.id} className="rounded-[20px] bg-[#f7f1e8] p-4">
                  <p className="text-sm font-medium text-black">{dress.name}</p>
                  <p className="mt-1 text-xs text-black/50">
                    {boutiques[dress.boutique_id]?.name || "Boutique Partner"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-[#efe7da] p-6">
          <p className="pill-label text-black/45">Profile Summary</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            Buyer profile essentials
          </h2>
          <div className="mt-6 grid gap-4 text-sm text-black/65">
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Account Name</p>
              <p className="mt-2 text-base text-black">{user.full_name || "Unnamed Buyer"}</p>
            </div>
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Email</p>
              <p className="mt-2 text-base text-black">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white/75 p-6">
          <p className="pill-label text-black/45">Your Booking Queue</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            Current booking requests
          </h2>
          <div className="mt-6 space-y-3">
            {bookings.length === 0 ? (
              <p className="text-sm leading-6 text-black/55">
                No bookings yet. Create one from your shortlist using the booking form above.
              </p>
            ) : (
              bookings.slice(0, 4).map((booking) => (
                <div key={booking.id} className="rounded-[20px] border border-black/10 bg-[#fffaf3] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-black">
                      {booking.appointment_type === "video" ? "Video Call" : "In Store Visit"}
                    </p>
                    <span className="rounded-full bg-black px-3 py-1 text-[11px] text-white">
                      {booking.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-black/55">{booking.scheduled_for}</p>
                  <p className="mt-1 text-xs text-black/45">
                    {booking.language} • {booking.dress_ids.length} shortlisted dress(es)
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
