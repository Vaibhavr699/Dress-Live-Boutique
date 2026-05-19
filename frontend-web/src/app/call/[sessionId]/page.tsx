import { ConsultantCallView } from "./consultant-call-view";

// Next.js 16: dynamic route params are now a Promise that must be awaited
// on the server side (or unwrapped via React.use() on the client side).
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
export default async function ConsultantCallPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const bookingId = Number(sessionId);

  // The whole call experience is interactive (LiveKit room + Decart
  // subscribe + camera/mic access), so the server side just resolves the
  // booking id and hands off to a client component.
  return <ConsultantCallView bookingId={Number.isFinite(bookingId) ? bookingId : null} />;
}
