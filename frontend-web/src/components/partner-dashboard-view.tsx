"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { getAuthHeaders, getStoredSession } from "@/lib/auth";
import { apiRequest } from "@/lib/api";

type Boutique = {
  id: number;
  name: string;
  description?: string | null;
  location?: string | null;
  is_visible_to_customers?: boolean;
};

type Dress = {
  id: number;
  name: string;
  price: number;
  colors?: string | null;
  sizes?: string | null;
};

type BookingStatus = "requested" | "accepted" | "rejected" | "rescheduled" | "completed";

type Booking = {
  id: number;
  appointment_type: string;
  status: BookingStatus;
  scheduled_for: string;
  language: string;
  dress_ids: number[];
};

export function PartnerDashboardView() {
  const router = useRouter();
  const session = useMemo(() => getStoredSession(), []);
  const user = session?.user?.role === "partner" ? session.user : null;
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [dresses, setDresses] = useState<Dress[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingBookingId, setUpdatingBookingId] = useState<number | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.replace("/login?role=partner");
      return;
    }

    if (session.user.role !== "partner") {
      router.replace("/dashboard/buyer");
      return;
    }

    Promise.all([
      session.user.boutique_id
        ? apiRequest<Boutique>(`/boutiques/${session.user.boutique_id}`)
        : Promise.resolve(null),
      session.user.boutique_id
        ? apiRequest<Dress[]>(`/dresses/?boutique_id=${session.user.boutique_id}`)
        : Promise.resolve([]),
      apiRequest<Booking[]>("/bookings/partner", {
        headers: getAuthHeaders(),
      }),
    ])
      .then(([boutiqueData, dressesData, bookingData]) => {
        setBoutique((boutiqueData as Boutique) ?? null);
        setDresses(Array.isArray(dressesData) ? dressesData : []);
        setBookings(Array.isArray(bookingData) ? bookingData : []);
      })
      .finally(() => setLoading(false));
  }, [router, session]);

  if (!user) {
    return null;
  }

  const boutiqueName = boutique?.name || "Partner Boutique";

  const updateBooking = async (
    bookingId: number,
    payload: { status?: BookingStatus; scheduled_for?: string }
  ) => {
    setUpdatingBookingId(bookingId);
    setActionError(null);

    try {
      const updated = await apiRequest<Booking>(`/bookings/${bookingId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? updated : booking))
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update booking.");
    } finally {
      setUpdatingBookingId(null);
    }
  };

  return (
    <DashboardShell
      user={user}
      role="partner"
      title="Partner Dashboard"
      subtitle="Manage the boutique workspace from desktop: visibility, catalog, bookings readiness, team operations and the core basics before AI live try-on."
    >
      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-black/10 bg-[#efe7da] p-6">
          <p className="pill-label text-black/45">Boutique Overview</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">{boutiqueName}</h2>
          <p className="mt-4 text-sm leading-6 text-black/60">
            {boutique?.description || "Your boutique web workspace is ready. Add catalog items, configure availability and receive bookings from the buyer experience."}
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Visibility</p>
              <p className="mt-2 text-base text-black">
                {boutique?.is_visible_to_customers ? "Visible to customers" : "Hidden from customers"}
              </p>
            </div>
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Location</p>
              <p className="mt-2 text-base text-black">{boutique?.location || "Location pending"}</p>
            </div>
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Catalog Count</p>
              <p className="mt-2 text-base text-black">{dresses.length} dress(es)</p>
            </div>
            <div className="rounded-[22px] bg-white/70 p-4">
              <p className="pill-label text-black/35">Booking Inbox</p>
              <p className="mt-2 text-base text-black">{bookings.length} request(s)</p>
            </div>
          </div>
        </div>

        <div id="bookings" className="rounded-[28px] bg-black px-6 py-6 text-white">
          <p className="pill-label text-white/55">What To Activate Next</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em]">
            Partner basics before AI and advanced live try-on
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Role-aware registration and boutique ownership",
              "Catalog visibility and dress management",
              "Team and consultant availability",
              "Booking inbox with accept, reject and reschedule",
            ].map((item) => (
              <div key={item} className="rounded-[22px] border border-white/10 bg-white/8 p-4 text-sm text-white/75">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="catalog" className="mt-8 rounded-[30px] border border-black/10 bg-white/75 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="pill-label text-black/45">Catalog Snapshot</p>
            <h2 className="font-serif-display mt-3 text-3xl tracking-[-0.04em] text-black">
              Dresses connected to this boutique
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-black/55">
            This web dashboard already reads from the same `dresses` and `boutiques` APIs as the mobile partner app. Once bookings are real, this becomes the operational control center.
          </p>
        </div>

        {loading ? (
          <div className="mt-10 text-sm text-black/45">Loading boutique catalog...</div>
        ) : dresses.length === 0 ? (
          <div className="mt-10 rounded-[24px] border border-dashed border-black/15 px-6 py-10 text-sm text-black/55">
            No dresses connected yet. Add dresses from the partner app or extend the web partner flow next.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dresses.map((dress) => (
              <article key={dress.id} className="rounded-[26px] border border-black/10 bg-[#fffaf3] p-5">
                <div className="h-[220px] rounded-[22px] bg-[linear-gradient(135deg,#eadcc8,#f6efe5)]" />
                <h3 className="mt-5 text-lg font-medium text-black">{dress.name}</h3>
                <p className="mt-2 text-sm text-black/55">
                  {dress.colors || "All colors"} • {dress.sizes || "All sizes"}
                </p>
                <p className="mt-4 text-sm font-medium text-black">
                  {typeof dress.price === "number" ? `${dress.price.toFixed(0)} EUR` : "Price pending"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="boutique" className="mt-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-[28px] border border-black/10 bg-white/75 p-6">
          <p className="pill-label text-black/45">Booking Inbox</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            Incoming requests
          </h2>
          {actionError ? (
            <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {actionError}
            </p>
          ) : null}
          <div className="mt-6 space-y-3">
            {bookings.length === 0 ? (
              <p className="text-sm leading-6 text-black/55">
                No bookings yet. Buyer-created appointment requests will appear here once the booking flow is used.
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
                    {booking.language} • {booking.dress_ids.length} selected dress(es)
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatingBookingId === booking.id}
                      onClick={() => updateBooking(booking.id, { status: "accepted" })}
                      className="rounded-full bg-black px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/35"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={updatingBookingId === booking.id}
                      onClick={() => updateBooking(booking.id, { status: "rejected" })}
                      className="rounded-full border border-black/15 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-black transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={rescheduleSlots[booking.id] ?? booking.scheduled_for}
                      onChange={(event) =>
                        setRescheduleSlots((current) => ({
                          ...current,
                          [booking.id]: event.target.value,
                        }))
                      }
                      className="h-11 flex-1 rounded-full border border-black/10 bg-white px-4 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={updatingBookingId === booking.id}
                      onClick={() =>
                        updateBooking(booking.id, {
                          status: "rescheduled",
                          scheduled_for: rescheduleSlots[booking.id] ?? booking.scheduled_for,
                        })
                      }
                      className="rounded-full border border-black/15 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-black transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white/75 p-6">
          <p className="pill-label text-black/45">Partner Identity</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            Logged in as {user.full_name || user.email}
          </h2>
          <div className="mt-6 grid gap-4 text-sm text-black/65">
            <div className="rounded-[22px] bg-[#f7f1e8] p-4">
              <p className="pill-label text-black/35">Role</p>
              <p className="mt-2 text-base text-black">{user.role}</p>
            </div>
            <div className="rounded-[22px] bg-[#f7f1e8] p-4">
              <p className="pill-label text-black/35">Boutique Id</p>
              <p className="mt-2 text-base text-black">{user.boutique_id ?? "Not linked yet"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white/75 p-6">
          <p className="pill-label text-black/45">Current System Gap</p>
          <h2 className="font-serif-display mt-4 text-3xl tracking-[-0.04em] text-black">
            What to connect after this
          </h2>
          <ul className="mt-6 space-y-3 text-sm leading-6 text-black/60">
            <li>Persist team members and consultant schedules in backend APIs.</li>
            <li>Drive buyer booking slots from partner availability.</li>
            <li>Surface live booking requests in the partner dashboard.</li>
            <li>Bridge appointment payment and order follow-up between both roles.</li>
          </ul>
        </div>
      </section>
    </DashboardShell>
  );
}
