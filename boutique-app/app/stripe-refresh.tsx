import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function StripeRefreshScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/earning-wallet');
  }, [router]);
  return null;
}
