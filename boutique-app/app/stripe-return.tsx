/**
 * Landing screen for the Stripe Connect onboarding redirect.
 *
 * Stripe sends the partner back to `dress-live-partner://stripe-return`
 * (configured server-side via STRIPE_CONNECT_RETURN_URL). We bounce them
 * straight to the wallet screen so its focus-effect re-polls status.
 *
 * The `stripe-refresh.tsx` sibling handles the same redirect when the
 * AccountLink has expired and Stripe asks the partner to retry — same UX.
 */

import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function StripeReturnScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/earning-wallet');
  }, [router]);
  return null;
}
