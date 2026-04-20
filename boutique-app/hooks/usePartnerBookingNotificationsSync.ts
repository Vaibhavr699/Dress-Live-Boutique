import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import {
  buildPartnerBookingNotificationDetails,
  syncScheduledBookingReminder,
} from '@/lib/partnerNotifications';

type PartnerBooking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';
  scheduled_for: string;
  location?: string | null;
  customer?: {
    full_name?: string | null;
    email?: string | null;
  } | null;
  boutique?: {
    location?: string | null;
  } | null;
};

export function usePartnerBookingNotificationsSync(enabled: boolean) {
  const upsert = useNotificationStore((s) => s.upsert);
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !token) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (appStateRef.current !== 'active') return;
      try {
        const data = await api.get('/bookings/partner');
        if (cancelled) return;
        const bookings = Array.isArray(data) ? (data as PartnerBooking[]) : [];
        bookings.forEach((booking) => {
          if (booking.status === 'requested') {
            upsert(buildPartnerBookingNotificationDetails(booking, 'booking_requested'));
          }
          if (['accepted', 'rescheduled', 'requested'].includes(booking.status)) {
            upsert(buildPartnerBookingNotificationDetails(booking, 'booking_upcoming'));
            void syncScheduledBookingReminder(booking);
          }
        });
      } catch {
        // ignore sync failures
      }
    };

    const sub = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      if (nextState === 'active') {
        tick();
      }
    });

    tick();
    const id = setInterval(tick, 45000);
    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(id);
    };
  }, [enabled, isAuthenticated, token, upsert]);
}
