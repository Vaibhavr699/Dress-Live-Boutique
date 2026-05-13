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
