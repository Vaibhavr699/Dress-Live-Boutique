"use client";

/**
 * Consultant's laptop call view.
 *
 * Flow:
 *   1. Pull the consultant's LiveKit token from /api/v1/video-calls/token
 *      and the booking's dresses from /api/v1/bookings/{id}.
 *   2. Connect to the booking-{id} LiveKit room. Publish camera + mic so
 *      the bride sees the consultant. Subscribe to remote tracks (the
 *      bride's audio in particular — we don't render her LiveKit video
 *      because she doesn't publish video when Decart is on).
 *   3. Listen on the LiveKit data channel for DECART_SUBSCRIBE_TOKEN
 *      messages from the bride. When we get one, hand it to
 *      useConsultantDecartSubscribe → that subscribes to Decart's CDN
 *      and gives us the same transformed MediaStream the bride is
 *      seeing on her phone.
 *   4. Render: bride's Decart-transformed video as the main view + own
 *      camera as a small PiP + 4 dress thumbnails below. Tap a thumbnail
 *      → publishData a SET_DRESS message; the bride's Decart session
 *      switches to that image+prompt within 1-3s.
 *
 * Auth: uses the existing localStorage session via getStoredSession /
 * getAuthHeaders — same pattern every other partner page uses. No
 * "email join token" path needed because the consultant is already
 * logged into the web dashboard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionState,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { apiRequest } from "@/lib/api";
import { getAuthHeaders, getStoredSession } from "@/lib/auth";
import {
  buildTryonSwitchPayload,
  parseDecartSubscribeTokenMessage,
} from "@/lib/video-call-signals";
import { useConsultantDecartSubscribe } from "@/lib/use-consultant-decart-subscribe";


type LiveKitTokenResponse = {
  url: string;
  token: string;
  room: string;
  identity: string;
};

type BookingDress = {
  id: number;
  name: string;
  price?: number;
  image_url?: string | null;
};

type Booking = {
  id: number;
  scheduled_for: string;
  appointment_type: "video" | "in_store";
  status: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  dresses?: BookingDress[] | null;
};


export function ConsultantCallView({ bookingId }: { bookingId: number | null }) {
  const router = useRouter();
  const [session] = useState(() => (typeof window !== "undefined" ? getStoredSession() : null));

  // Auth gate — consultants only. Buyers shouldn't land here at all.
  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.replace("/login?role=partner");
      return;
    }
    if (session.user?.role !== "partner") {
      router.replace("/dashboard/buyer");
    }
  }, [router, session]);

  // ── Fetch booking + LiveKit token ─────────────────────────────────────
  const [tokenData, setTokenData] = useState<LiveKitTokenResponse | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.user?.role !== "partner" || bookingId == null) return;
    let cancelled = false;
    Promise.all([
      apiRequest<LiveKitTokenResponse>(`/video-calls/token?booking_id=${bookingId}`, {
        headers: getAuthHeaders(),
      }),
      apiRequest<Booking>(`/bookings/${bookingId}`, {
        headers: getAuthHeaders(),
      }),
    ])
      .then(([tok, bkg]) => {
        if (cancelled) return;
        setTokenData(tok);
        setBooking(bkg);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFetchError((e as { message?: string })?.message || "Could not load call.");
      });
    return () => { cancelled = true; };
  }, [session, bookingId]);

  // ── LiveKit room ───────────────────────────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [decartSubscribeToken, setDecartSubscribeToken] = useState<string | null>(null);
  // Audio-only refs so we can attach the bride's mic to a hidden <audio>.
  const remoteAudioTracksRef = useRef<Set<RemoteTrack>>(new Set());
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!tokenData) return;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    let cancelled = false;

    const handleConnectionChange = (s: ConnectionState) => {
      if (cancelled) return;
      setConnectionState(s);
    };
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const raw = new TextDecoder().decode(payload);
        const msg = parseDecartSubscribeTokenMessage(raw);
        if (!msg || msg.bookingId !== bookingId) return;
        setDecartSubscribeToken(msg.token);
      } catch {
        // ignore other message types
      }
    };
    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLAudioElement;
        el.autoplay = true;
        audioContainerRef.current?.appendChild(el);
        remoteAudioTracksRef.current.add(track);
      }
      // We intentionally do NOT attach the bride's remote video — when
      // Decart is on her video doesn't publish at all, and when it's off
      // the consultant would see her raw stream (rare case; falls back
      // to a placeholder below).
    };
    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        track.detach().forEach((el) => el.remove());
        remoteAudioTracksRef.current.delete(track);
      }
    };

    r.on(RoomEvent.ConnectionStateChanged, handleConnectionChange);
    r.on(RoomEvent.DataReceived, handleDataReceived);
    r.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    r.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    (async () => {
      try {
        await r.connect(tokenData.url, tokenData.token);
        if (cancelled) {
          await r.disconnect();
          return;
        }
        await r.localParticipant.enableCameraAndMicrophone();
        // Attach own camera preview
        const camPub = [...r.localParticipant.trackPublications.values()].find(
          (p) => p.source === Track.Source.Camera && p.track,
        );
        const camTrack = camPub?.track;
        if (camTrack && localVideoRef.current) {
          camTrack.attach(localVideoRef.current);
        }
        if (!cancelled) setRoom(r);
      } catch (e) {
        if (cancelled) return;
        setFetchError((e as { message?: string })?.message || "Could not join the video room.");
      }
    })();

    return () => {
      cancelled = true;
      r.off(RoomEvent.ConnectionStateChanged, handleConnectionChange);
      r.off(RoomEvent.DataReceived, handleDataReceived);
      r.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      r.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      r.disconnect();
    };
  }, [tokenData, bookingId]);

  // ── Decart subscribe (bride → us) ─────────────────────────────────────
  const decart = useConsultantDecartSubscribe({ token: decartSubscribeToken });

  // Attach the subscribed stream to the main <video> via a ref each time
  // it changes. <video srcObject={...}> directly via JSX prop is finicky
  // across React versions; the imperative attach is reliable.
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!mainVideoRef.current) return;
    mainVideoRef.current.srcObject = decart.subscribedStream;
  }, [decart.subscribedStream]);

  // ── Dress switching ───────────────────────────────────────────────────
  const dresses = useMemo(() => booking?.dresses ?? [], [booking?.dresses]);
  const [activeDressId, setActiveDressId] = useState<number | null>(null);

  const sendDressSwitch = useCallback(
    async (dressId: number | null, dressName: string | null) => {
      if (!room || !bookingId) return;
      setActiveDressId(dressId);
      if (dressId == null) return;
      try {
        const payload = buildTryonSwitchPayload({ bookingId, dressId, dressName });
        await room.localParticipant.publishData(payload, { reliable: true });
      } catch {
        // best-effort — UI shows the local selection regardless
      }
    },
    [room, bookingId],
  );

  // Re-send the current dress whenever the bride (re-)joins, mirroring
  // the boutique-app pattern. Otherwise a bride who joins after the
  // consultant has already picked a dress would see herself in "no
  // dress" mode until the consultant tapped again.
  useEffect(() => {
    if (!room || activeDressId == null) return;
    const sendCurrent = () => {
      const dress = dresses.find((d) => d.id === activeDressId);
      sendDressSwitch(activeDressId, dress?.name ?? null);
    };
    room.on(RoomEvent.ParticipantConnected, sendCurrent);
    return () => { room.off(RoomEvent.ParticipantConnected, sendCurrent); };
  }, [room, activeDressId, dresses, sendDressSwitch]);

  const endCall = useCallback(() => {
    try { room?.disconnect(); } catch {}
    router.replace("/dashboard/partner/bookings");
  }, [room, router]);

  // ── Render ────────────────────────────────────────────────────────────
  if (bookingId == null) {
    return <FullScreenMessage title="Invalid booking" body="Open the call from the bookings list." onBack={() => router.replace("/dashboard/partner/bookings")} />;
  }
  if (fetchError) {
    return <FullScreenMessage title="Could not start the call" body={fetchError} onBack={() => router.replace("/dashboard/partner/bookings")} />;
  }
  if (!tokenData || !booking) {
    return <FullScreenMessage title="Loading call…" body="Reaching LiveKit and your booking." />;
  }

  const customerName = booking.customer?.full_name?.trim() || booking.customer?.email || "your customer";

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-[2px] text-white/60">Live video fitting</span>
          <span className="text-sm">{customerName} · booking #{booking.id}</span>
        </div>
        <button
          onClick={endCall}
          className="rounded-full bg-red-600 hover:bg-red-500 px-5 py-2 text-sm font-medium transition"
        >
          End call
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-6">
        {/* Bride's video (main) */}
        <div className="relative flex-1 rounded-2xl overflow-hidden bg-black aspect-video lg:aspect-auto min-h-[400px]">
          {decart.subscribedStream ? (
            <video
              ref={mainVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="text-center max-w-md">
                <p className="text-xs uppercase tracking-[2px] text-white/40 mb-2">Customer</p>
                <p className="text-white/70 text-sm leading-6">
                  {decart.status === "error"
                    ? `AI try-on stream error · ${decart.errorMessage ?? "unknown"}`
                    : decart.status === "connecting"
                    ? "Connecting AI try-on stream…"
                    : connectionState !== ConnectionState.Connected
                    ? "Joining the room…"
                    : "Waiting for the customer to start the AI try-on…"}
                </p>
              </div>
            </div>
          )}

          {/* Own camera PiP */}
          <div className="absolute right-4 top-4 w-32 h-44 lg:w-40 lg:h-56 rounded-xl overflow-hidden border border-white/30 bg-black/80">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          </div>
        </div>

        {/* Dress picker side rail */}
        <div className="lg:w-80 flex flex-col gap-3">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <p className="text-[10px] uppercase tracking-[2px] text-white/60 mb-3">Try-on controls</p>
            <button
              onClick={() => sendDressSwitch(null, null)}
              className={`w-full mb-3 rounded-lg py-2 text-sm transition ${activeDressId == null ? "bg-white text-black" : "bg-white/10 hover:bg-white/20"}`}
            >
              No dress (just her)
            </button>
            <div className="grid grid-cols-2 gap-2">
              {dresses.length === 0 ? (
                <p className="col-span-2 text-white/50 text-xs">No dresses on this booking.</p>
              ) : (
                dresses.map((d) => {
                  const isActive = d.id === activeDressId;
                  return (
                    <button
                      key={d.id}
                      onClick={() => sendDressSwitch(d.id, d.name)}
                      className={`group rounded-lg overflow-hidden border transition text-left ${isActive ? "border-white" : "border-white/15 hover:border-white/40"}`}
                    >
                      <div className="aspect-[3/4] bg-white/5 overflow-hidden">
                        {d.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.image_url} alt={d.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">
                            no image
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <p className="text-xs truncate">{d.name}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Status panel */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-xs space-y-1">
            <Row label="Room" value={connectionState} />
            <Row label="AI try-on" value={decart.status + (decart.errorMessage ? ` · ${decart.errorMessage}` : "")} />
            <Row label="Bride sent token?" value={decartSubscribeToken ? "yes" : "waiting"} />
          </div>
        </div>
      </div>

      {/* Hidden audio sink for remote audio tracks */}
      <div ref={audioContainerRef} className="hidden" />
    </div>
  );
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className="text-white/80 truncate text-right">{value}</span>
    </div>
  );
}


function FullScreenMessage({
  title,
  body,
  onBack,
}: {
  title: string;
  body: string;
  onBack?: () => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[10px] uppercase tracking-[2px] text-white/40 mb-3">Live video fitting</p>
        <h1 className="text-xl mb-3">{title}</h1>
        <p className="text-white/70 text-sm leading-6">{body}</p>
        {onBack ? (
          <button
            onClick={onBack}
            className="mt-6 rounded-full border border-white/30 px-5 py-2 text-sm hover:bg-white/10 transition"
          >
            Back to bookings
          </button>
        ) : null}
      </div>
    </div>
  );
}
