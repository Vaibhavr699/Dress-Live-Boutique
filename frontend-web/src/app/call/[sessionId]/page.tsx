import { BrideCallView } from "./bride-call-view";

// Next.js 16: dynamic-route params are a Promise that must be awaited
// on the server side. See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md
//
// We also read the `token` searchParam here so the server can fail
// fast if it's missing — this page is the bride's email-link landing
// and the JWT-in-URL IS the only auth path. If the token is absent we
// hand a clear message to the client component to render.
export default async function BrideCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { sessionId } = await params;
  const { token } = await searchParams;
  const bookingId = Number(sessionId);

  return (
    <BrideCallView
      bookingId={Number.isFinite(bookingId) ? bookingId : null}
      token={token?.trim() || null}
    />
  );
}
