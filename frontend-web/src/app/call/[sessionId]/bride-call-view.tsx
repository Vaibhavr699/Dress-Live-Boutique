"use client";

/**
 * Bride's laptop call view (the spec's landing page from her email link).
 *
 * Flow per spec:
 *   1. Page validates token (no login) — by calling /web-join with the
 *      JWT from ?token=. Server returns LiveKit + Decart creds + dresses.
 *   2. Pre-call screen: page asks for cam+mic via getUserMedia, then
 *      shows a "Join live fitting" button.
 *   3. Bride taps Join → LiveKit room connect + Decart realtime session
 *      starts. Audio goes via LK, video stays in Decart (we broadcast
 *      the Decart subscribeToken over LK data channel so the consultant
 *      can subscribe directly).
 *   4. Bride sees herself fullscreen with the dress overlaid. No dress
 *      controls on her side — the consultant taps thumbnails from the
 *      boutique-app and the SET_DRESS message arrives on her data
 *      channel, applied via the Decart publish hook.
 *   5. Either party hangs up → web page closes. Bride opens her phone
 *      app to pick a favorite.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ConnectionState,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import {
  buildDecartSubscribeTokenPayload,
  parseTryonSwitchMessageFromBytes,
} from "@/lib/video-call-signals-bride";
import type { WebJoinResponse } from "@/lib/call-types";
import { fetchWebJoin, WebJoinError } from "@/lib/web-join";
import { useBrideDecartPublish } from "@/lib/use-bride-decart-publish";


type Stage = "validating" | "ready-to-join" | "joining" | "in-call" | "ended" | "error";


export function BrideCallView({
  bookingId,
  token,
}: {
  bookingId: number | null;
  token: string | null;
}) {
  // ── 1. Validate the email JWT against /web-join ────────────────────────
  const [stage, setStage] = useState<Stage>("validating");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joinData, setJoinData] = useState<WebJoinResponse | null>(null);

  useEffect(() => {
    if (bookingId == null || !token) {
      setStage("error");
      setErrorMessage(
        bookingId == null
          ? "This link is missing a booking. Open it from the email we sent."
          : "This link is missing its security token. Open it directly from the email — don't copy-paste the URL.",
      );
      return;
    }
    let cancelled = false;
    fetchWebJoin(bookingId, token)
      .then((data) => {
        if (cancelled) return;
        setJoinData(data);
        setStage("ready-to-join");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErrorMessage(e instanceof WebJoinError ? e.message : String(e));
        setStage("error");
      });
    return () => { cancelled = true; };
  }, [bookingId, token]);

  // ── 2. Once the user clicks Join, open Decart + LiveKit ────────────────
  const [decartEnabled, setDecartEnabled] = useState(false);

  const decart = useBrideDecartPublish({
    enabled: decartEnabled,
    apiKey: joinData?.decart?.api_key ?? null,
    model: joinData?.decart?.model ?? null,
    dresses: joinData?.dresses ?? [],
  });

  // ── 3. LiveKit room (audio + data channel only — video stays in Decart)
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteAudioTracksRef = useRef<Set<RemoteTrack>>(new Set());
  const consultantVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (stage !== "in-call" || !joinData) return;

    const r = new Room({ adaptiveStream: true, dynacast: true });
    let cancelled = false;

    const handleConnectionChange = (s: ConnectionState) => {
      if (cancelled) return;
      setConnectionState(s);
    };
    const handleDataReceived = (payload: Uint8Array) => {
      // The only message we care about on the bride side is SET_DRESS
      // (consultant tapped a thumbnail). Anything else is silently
      // dropped.
      const msg = parseTryonSwitchMessageFromBytes(payload);
      if (!msg || msg.bookingId !== bookingId) return;
      if (msg.dressId == null) {
        decart.clearDress();
      } else {
        decart.switchDress(msg.dressId);
      }
    };
    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLAudioElement;
        el.autoplay = true;
        audioContainerRef.current?.appendChild(el);
        remoteAudioTracksRef.current.add(track);
      } else if (track.kind === Track.Kind.Video && consultantVideoRef.current) {
        // Consultant publishes their own camera so the bride can see
        // who she's talking to (PiP in the corner).
        track.attach(consultantVideoRef.current);
      }
    };
    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      if (track.kind === Track.Kind.Audio) {
        remoteAudioTracksRef.current.delete(track);
      }
    };
    const handleParticipantDisconnected = () => {
      // Spec: "Either party hangs up → web page closes". When the
      // consultant leaves, end the call from our side too.
      if (!cancelled) endCallInternal();
    };

    r.on(RoomEvent.ConnectionStateChanged, handleConnectionChange);
    r.on(RoomEvent.DataReceived, handleDataReceived);
    r.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    r.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    r.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    (async () => {
      try {
        await r.connect(joinData.livekit.url, joinData.livekit.token);
        if (cancelled) { await r.disconnect(); return; }
        // Publish ONLY audio. Video stays in Decart — never enters LK.
        await r.localParticipant.setMicrophoneEnabled(true);
        if (!cancelled) setRoom(r);
      } catch (e) {
        if (cancelled) return;
        setErrorMessage((e as { message?: string })?.message || "Could not join the call.");
        setStage("error");
      }
    })();

    function endCallInternal() {
      setStage("ended");
      setDecartEnabled(false);
      try { r.disconnect(); } catch {}
    }

    return () => {
      cancelled = true;
      r.off(RoomEvent.ConnectionStateChanged, handleConnectionChange);
      r.off(RoomEvent.DataReceived, handleDataReceived);
      r.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      r.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      r.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      r.disconnect();
    };
  }, [stage, joinData, bookingId, decart]);

  // ── 4. When Decart's subscribeToken lands, broadcast it to consultant
  useEffect(() => {
    if (!room || !decart.subscribeToken || bookingId == null) return;
    try {
      const payload = buildDecartSubscribeTokenPayload({
        bookingId,
        token: decart.subscribeToken,
      });
      room.localParticipant.publishData(payload, { reliable: true });
    } catch {
      // best-effort — if the consultant doesn't get the token, the
      // bride still sees herself; only the consultant's view is broken.
    }
  }, [room, decart.subscribeToken, bookingId]);

  // ── 5. Render the bride's transformed video fullscreen ─────────────────
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!mainVideoRef.current) return;
    mainVideoRef.current.srcObject = decart.transformedStream;
  }, [decart.transformedStream]);

  const handleJoin = useCallback(() => {
    setStage("joining");
    setDecartEnabled(true);
    // When Decart connects (decart.status === 'connected'), an effect
    // below transitions to in-call.
  }, []);

  useEffect(() => {
    if (stage === "joining" && decart.status === "connected") {
      setStage("in-call");
    } else if (stage === "joining" && decart.status === "error") {
      setStage("error");
      setErrorMessage(decart.errorMessage);
    }
  }, [stage, decart.status, decart.errorMessage]);

  const handleEndCall = useCallback(() => {
    setStage("ended");
    setDecartEnabled(false);
    try { room?.disconnect(); } catch {}
  }, [room]);

  const boutiqueName = useMemo(() => {
    // /web-join doesn't return boutique info today; could add later
    return "your boutique";
  }, []);

  // ── UI states ──────────────────────────────────────────────────────────
  if (stage === "validating") {
    return <Centered title="Opening your fitting…" body="One moment." />;
  }
  if (stage === "error") {
    return <Centered title="We can't open this fitting" body={errorMessage ?? "Unknown error."} />;
  }
  if (stage === "ended") {
    return (
      <Centered
        title="Your fitting is complete"
        body="Open the Dress Live app on your phone to pick the dress you loved most."
      />
    );
  }
  if (stage === "ready-to-join") {
    return (
      <PreCall
        scheduledFor={joinData?.scheduled_for ?? null}
        dressCount={joinData?.dresses.length ?? 0}
        onJoin={handleJoin}
        boutiqueName={boutiqueName}
      />
    );
  }

  // joining + in-call render the live UI; we keep it mounted across both
  // so the camera permission popup → first frame transition is seamless.
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <span className="text-[10px] uppercase tracking-[2px] text-white/60">
          Live fitting
        </span>
        <button
          onClick={handleEndCall}
          className="rounded-full bg-red-600 hover:bg-red-500 px-5 py-2 text-sm font-medium transition"
        >
          End call
        </button>
      </div>

      {/* Fullscreen bride video */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        {decart.transformedStream ? (
          <video
            ref={mainVideoRef}
            autoPlay
            playsInline
            muted    /* bride sees herself — own audio would echo */
            className="w-full h-full object-cover -scale-x-100"
          />
        ) : (
          <div className="text-center max-w-md px-6">
            <div className="inline-block w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin mb-4" />
            <p className="text-white/70 text-sm">
              {decart.status === "requesting-camera"
                ? "Allow camera + microphone in the popup, please."
                : decart.status === "starting"
                ? "Starting AI try-on…"
                : "Connecting…"}
            </p>
          </div>
        )}

        {/* Consultant in a corner PiP */}
        <div className="absolute right-4 top-4 w-40 h-56 rounded-xl overflow-hidden border border-white/30 bg-black/80">
          <video
            ref={consultantVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Status footer */}
      <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between text-xs text-white/50">
        <span>
          {connectionState === ConnectionState.Connected ? "Connected" : connectionState}
          {" · "}
          {decart.status === "connected" ? "AI try-on live" : `AI try-on · ${decart.status}`}
        </span>
        <span>booking #{bookingId}</span>
      </div>

      <div ref={audioContainerRef} className="hidden" />
    </div>
  );
}


function PreCall({
  scheduledFor,
  dressCount,
  onJoin,
  boutiqueName,
}: {
  scheduledFor: string | null;
  dressCount: number;
  onJoin: () => void;
  boutiqueName: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[10px] uppercase tracking-[2px] text-white/40 mb-4">Live fitting</p>
        <h1 className="text-2xl font-light mb-3">You&apos;re ready for your fitting</h1>
        <p className="text-white/70 text-sm leading-6 mb-6">
          Your consultant from {boutiqueName} will start the session shortly.
          {dressCount > 0 ? ` ${dressCount} dresses are ready to try.` : ""}
        </p>
        {scheduledFor ? (
          <p className="text-white/40 text-xs mb-8">{scheduledFor}</p>
        ) : null}

        <button
          onClick={onJoin}
          className="rounded-full bg-emerald-600 hover:bg-emerald-500 transition px-10 py-3 text-sm font-medium"
        >
          Join live fitting
        </button>

        <p className="text-white/40 text-xs mt-6 leading-5">
          We&apos;ll ask for camera and microphone access. You&apos;ll see yourself
          fullscreen with your dress overlaid; your consultant will pick the dress
          for you to try.
        </p>
      </div>
    </div>
  );
}


function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[10px] uppercase tracking-[2px] text-white/40 mb-3">Live fitting</p>
        <h1 className="text-xl mb-3 font-light">{title}</h1>
        <p className="text-white/70 text-sm leading-6">{body}</p>
      </div>
    </div>
  );
}
