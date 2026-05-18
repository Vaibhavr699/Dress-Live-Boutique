/**
 * In-room data messages between advisor and customer (LiveKit publishData).
 * Milestone A: signaling only. Milestone B: AI pipeline consumes the same events.
 *
 * Two message families:
 *   - tryon.switch (advisor → buyer): "use this dress for the live render"
 *   - tryon.frame  (buyer → advisor): chunked stream of the rendered overlay
 *     so the advisor sees what the customer sees, in real time
 */

export const TRYON_SWITCH_TYPE = 'tryon.switch' as const;
export const TRYON_FRAME_TYPE = 'tryon.frame' as const;
export const POSE_LANDMARKS_TYPE = 'pose.landmarks' as const;
/**
 * Bride → advisor: the short-lived token the advisor uses to subscribe to
 * the bride's running Decart realtime session. Sent (a) when Decart first
 * connects on the bride's device and (b) every time a new remote
 * participant joins, so a late-arriving advisor still gets a token.
 */
export const DECART_SUBSCRIBE_TOKEN_TYPE = 'decart.subscribe_token' as const;
export const TRYON_SCHEMA_VERSION = 1;

// LiveKit publishData has a hard limit of ~15KB per packet. We split the
// JPEG data URL into chunks well under that and let the receiver reassemble
// by frameId. 12KB keeps headroom for the JSON envelope + base64 overhead.
const TRYON_FRAME_CHUNK_SIZE = 12 * 1024;

export type TryonSwitchMessage = {
  type: typeof TRYON_SWITCH_TYPE;
  schemaVersion: typeof TRYON_SCHEMA_VERSION;
  bookingId: number;
  dressId: number;
  dressName?: string | null;
};

export function buildTryonSwitchPayload(params: {
  bookingId: number;
  dressId: number;
  dressName?: string | null;
}): Uint8Array {
  const body: TryonSwitchMessage = {
    type: TRYON_SWITCH_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId: params.bookingId,
    dressId: params.dressId,
    ...(params.dressName != null && params.dressName !== ''
      ? { dressName: params.dressName }
      : {}),
  };
  return new TextEncoder().encode(JSON.stringify(body));
}

export function parseTryonSwitchMessage(raw: string): TryonSwitchMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== TRYON_SWITCH_TYPE) return null;
  const version = o.schemaVersion;
  if (version !== undefined && version !== TRYON_SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const dressId = o.dressId;
  if (typeof bookingId !== 'number' || !Number.isFinite(bookingId)) return null;
  if (typeof dressId !== 'number' || !Number.isFinite(dressId)) return null;
  const dressName = o.dressName;
  if (dressName != null && typeof dressName !== 'string') return null;
  return {
    type: TRYON_SWITCH_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId,
    dressId,
    ...(typeof dressName === 'string' ? { dressName } : {}),
  };
}

// ── Try-on frame chunked relay ────────────────────────────────────────────
// The buyer's render result is too large for a single LK packet, so we slice
// the JPEG data URL into N pieces. Each piece carries the same `frameId`
// so the receiver can stitch them back together (and discard incomplete
// frames when a newer one starts arriving).

export type TryonFrameChunkMessage = {
  type: typeof TRYON_FRAME_TYPE;
  schemaVersion: typeof TRYON_SCHEMA_VERSION;
  bookingId: number;
  dressId: number;
  frameId: string;
  chunkIndex: number;
  totalChunks: number;
  // Slice of the full image data URL (e.g. "data:image/jpeg;base64,..." for
  // chunk 0; raw base64 continuation for the rest). The receiver simply
  // concatenates `dataUrlPart` in order.
  dataUrlPart: string;
};

function makeFrameId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildTryonFrameChunks(params: {
  bookingId: number;
  dressId: number;
  imageDataUrl: string;
  frameId?: string;
}): { frameId: string; chunks: Uint8Array[] } {
  const frameId = params.frameId ?? makeFrameId();
  const data = params.imageDataUrl;
  const total = Math.max(1, Math.ceil(data.length / TRYON_FRAME_CHUNK_SIZE));
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < total; i++) {
    const slice = data.slice(i * TRYON_FRAME_CHUNK_SIZE, (i + 1) * TRYON_FRAME_CHUNK_SIZE);
    const msg: TryonFrameChunkMessage = {
      type: TRYON_FRAME_TYPE,
      schemaVersion: TRYON_SCHEMA_VERSION,
      bookingId: params.bookingId,
      dressId: params.dressId,
      frameId,
      chunkIndex: i,
      totalChunks: total,
      dataUrlPart: slice,
    };
    chunks.push(encoder.encode(JSON.stringify(msg)));
  }
  return { frameId, chunks };
}

export function parseTryonFrameMessage(raw: string): TryonFrameChunkMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== TRYON_FRAME_TYPE) return null;
  const version = o.schemaVersion;
  if (version !== undefined && version !== TRYON_SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const dressId = o.dressId;
  const chunkIndex = o.chunkIndex;
  const totalChunks = o.totalChunks;
  const frameId = o.frameId;
  const dataUrlPart = o.dataUrlPart;
  if (typeof bookingId !== 'number' || !Number.isFinite(bookingId)) return null;
  if (typeof dressId !== 'number' || !Number.isFinite(dressId)) return null;
  if (typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  if (typeof totalChunks !== 'number' || !Number.isInteger(totalChunks) || totalChunks < 1) return null;
  if (typeof frameId !== 'string' || frameId.length === 0) return null;
  if (typeof dataUrlPart !== 'string') return null;
  return {
    type: TRYON_FRAME_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId,
    dressId,
    frameId,
    chunkIndex,
    totalChunks,
    dataUrlPart,
  };
}

// ── Pose landmark fan-out (buyer → advisor) ──────────────────────────────
// The buyer's app polls /ai/live-pose-landmarks at ~5 Hz to drive its own
// AR overlay. We re-broadcast those same landmarks over the data channel
// so the advisor's app can render the EXACT SAME overlay on its copy of
// the buyer's remote video — without each side hitting the backend
// separately. One JSON envelope fits easily under LK's 15 KB packet
// ceiling so no chunking is needed.

export type PoseLandmarksMessage = {
  type: typeof POSE_LANDMARKS_TYPE;
  schemaVersion: typeof TRYON_SCHEMA_VERSION;
  bookingId: number;
  dressId: number;
  ts: number;             // ms epoch, lets receivers stale-out old data
  landmarks: {
    image_left_shoulder: { x: number; y: number; visibility?: number };
    image_right_shoulder: { x: number; y: number; visibility?: number };
    image_left_hip: { x: number; y: number; visibility?: number };
    image_right_hip: { x: number; y: number; visibility?: number };
  };
};

export function buildPoseLandmarksPayload(params: {
  bookingId: number;
  dressId: number;
  landmarks: PoseLandmarksMessage['landmarks'];
}): Uint8Array {
  const body: PoseLandmarksMessage = {
    type: POSE_LANDMARKS_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId: params.bookingId,
    dressId: params.dressId,
    ts: Date.now(),
    landmarks: params.landmarks,
  };
  return new TextEncoder().encode(JSON.stringify(body));
}

export function parsePoseLandmarksMessage(raw: string): PoseLandmarksMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== POSE_LANDMARKS_TYPE) return null;
  const version = o.schemaVersion;
  if (version !== undefined && version !== TRYON_SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const dressId = o.dressId;
  const ts = o.ts;
  const lm = o.landmarks;
  if (typeof bookingId !== 'number' || !Number.isFinite(bookingId)) return null;
  if (typeof dressId !== 'number' || !Number.isFinite(dressId)) return null;
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  if (!lm || typeof lm !== 'object') return null;

  const lmObj = lm as Record<string, unknown>;
  const keys = ['image_left_shoulder', 'image_right_shoulder', 'image_left_hip', 'image_right_hip'] as const;
  const out: PoseLandmarksMessage['landmarks'] = {} as any;
  for (const k of keys) {
    const v = lmObj[k];
    if (!v || typeof v !== 'object') return null;
    const vo = v as Record<string, unknown>;
    if (typeof vo.x !== 'number' || typeof vo.y !== 'number') return null;
    out[k] = {
      x: vo.x,
      y: vo.y,
      ...(typeof vo.visibility === 'number' ? { visibility: vo.visibility } : {}),
    };
  }

  return {
    type: POSE_LANDMARKS_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId,
    dressId,
    ts,
    landmarks: out,
  };
}


// ── Receiver-side reassembler ─────────────────────────────────────────────
// Drop-in for partner views: feed each parsed chunk; get a complete data URL
// back when (and only when) every chunk for that frameId has arrived.

export type TryonFrameReassembler = {
  ingest: (msg: TryonFrameChunkMessage) => {
    complete: false;
  } | {
    complete: true;
    frameId: string;
    bookingId: number;
    dressId: number;
    imageDataUrl: string;
  };
  reset: () => void;
};

export function createTryonFrameReassembler(opts?: {
  // Drop partial frames older than this if a newer frameId starts arriving.
  // Keeps memory bounded if a sender drops mid-stream.
  maxConcurrentFrames?: number;
}): TryonFrameReassembler {
  const maxConcurrent = Math.max(1, opts?.maxConcurrentFrames ?? 3);
  type Pending = {
    bookingId: number;
    dressId: number;
    totalChunks: number;
    parts: (string | undefined)[];
    receivedCount: number;
    insertedAt: number;
  };
  const pending = new Map<string, Pending>();

  const evictIfNeeded = () => {
    if (pending.size <= maxConcurrent) return;
    // Drop oldest by insertion order.
    const oldestKey = pending.keys().next().value as string | undefined;
    if (oldestKey) pending.delete(oldestKey);
  };

  return {
    ingest(msg) {
      let entry = pending.get(msg.frameId);
      if (!entry) {
        entry = {
          bookingId: msg.bookingId,
          dressId: msg.dressId,
          totalChunks: msg.totalChunks,
          parts: new Array(msg.totalChunks),
          receivedCount: 0,
          insertedAt: Date.now(),
        };
        pending.set(msg.frameId, entry);
        evictIfNeeded();
      }
      if (entry.parts[msg.chunkIndex] === undefined) {
        entry.parts[msg.chunkIndex] = msg.dataUrlPart;
        entry.receivedCount += 1;
      }
      if (entry.receivedCount < entry.totalChunks) {
        return { complete: false } as const;
      }
      pending.delete(msg.frameId);
      const imageDataUrl = entry.parts.join('');
      return {
        complete: true as const,
        frameId: msg.frameId,
        bookingId: entry.bookingId,
        dressId: entry.dressId,
        imageDataUrl,
      };
    },
    reset() {
      pending.clear();
    },
  };
}


// ── Decart subscribe-token broadcast ──────────────────────────────────────
// Sent by the bride (only when the Decart pipeline is on) so the advisor
// can subscribe to the bride's running Decart session and watch the same
// transformed video. We re-broadcast on every new participant-joined event
// (and once per token refresh) so an advisor who joins after the bride
// still receives a usable token without us caching it on a server.

export type DecartSubscribeTokenMessage = {
  type: typeof DECART_SUBSCRIBE_TOKEN_TYPE;
  schemaVersion: typeof TRYON_SCHEMA_VERSION;
  bookingId: number;
  /** Opaque Decart subscribe token (base64-encoded { sid, ip, port }).
   * Caller hands this to the SDK's subscribe API; we never decode it
   * client-side. */
  token: string;
};

export function buildDecartSubscribeTokenPayload(params: {
  bookingId: number;
  token: string;
}): Uint8Array {
  const body: DecartSubscribeTokenMessage = {
    type: DECART_SUBSCRIBE_TOKEN_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId: params.bookingId,
    token: params.token,
  };
  return new TextEncoder().encode(JSON.stringify(body));
}

export function parseDecartSubscribeTokenMessage(raw: string): DecartSubscribeTokenMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.type !== DECART_SUBSCRIBE_TOKEN_TYPE) return null;
  if (o.schemaVersion !== TRYON_SCHEMA_VERSION) return null;
  const bookingId = o.bookingId;
  const token = o.token;
  if (typeof bookingId !== 'number' || !Number.isFinite(bookingId)) return null;
  if (typeof token !== 'string' || !token.trim()) return null;
  return {
    type: DECART_SUBSCRIBE_TOKEN_TYPE,
    schemaVersion: TRYON_SCHEMA_VERSION,
    bookingId,
    token,
  };
}
