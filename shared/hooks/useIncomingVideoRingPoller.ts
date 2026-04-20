import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api } from '../api/api';
import { useAuthStore } from '../store/useAuthStore';
import { useIncomingVideoRingStore } from '../store/useIncomingVideoRingStore';

/**
 * Polls the server for an incoming video ring from the other party on a shared booking.
 */
export function useIncomingVideoRingPoller(enabled: boolean) {
  const setIncoming = useIncomingVideoRingStore((s) => s.setIncoming);
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !token) {
      setIncoming(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (appStateRef.current !== 'active') return;
      try {
        const res = (await api.get('/video-calls/incoming-ring')) as {
          incoming?: {
            booking_id: number;
            caller_display_name?: string;
            caller_role: 'buyer' | 'partner';
            scheduled_for?: string | null;
          } | null;
        };
        if (cancelled) return;
        const inc = res?.incoming;
        if (inc?.booking_id) {
          setIncoming({
            bookingId: inc.booking_id,
            callerDisplayName: inc.caller_display_name?.trim() || 'Video call',
            callerRole: inc.caller_role,
            scheduledFor: inc.scheduled_for ?? null,
          });
        } else {
          setIncoming(null);
        }
      } catch {
        if (!cancelled) setIncoming(null);
      }
    };

    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        tick();
      }
    });

    tick();
    const id = setInterval(tick, 12000);
    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(id);
    };
  }, [enabled, isAuthenticated, token, setIncoming]);
}
