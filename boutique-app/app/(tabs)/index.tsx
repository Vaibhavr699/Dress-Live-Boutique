import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions, ActivityIndicator, Alert, AppState, RefreshControl } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import { useAuthStore } from '@shared/store/useAuthStore';
import { api } from '@shared/api/api';
import { FigmaConfirmModal } from '../../components/FigmaConfirmModal';

const { width } = Dimensions.get('window');

const DRESS_SVG = `<svg width="32" height="34" viewBox="0 0 32 34" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M29.4255 20.7868C31.2232 21.9683 31.6836 24.3851 30.4922 26.1772C27.2707 31.0222 21.5446 34.1119 15.5691 34.0893C9.59357 34.1119 3.88157 30.7629 0.660067 25.9179C-0.53135 24.1258 -0.0709332 21.7104 1.72682 20.5289L9.9024 15.5848H21.2357L29.4255 20.7868ZM9.9024 12.75H21.2357L22.2812 9.61633C22.5277 8.5085 22.6524 7.37092 22.6524 6.23617V1.41667C22.6524 0.634667 22.0177 0 21.2357 0C20.4537 0 19.8191 0.634667 19.8191 1.41667V2.975C17.9349 3.32492 16.4856 4.29958 15.5691 5.11558C14.6525 4.29958 13.2032 3.32492 11.3191 2.975V1.41667C11.3191 0.634667 10.6844 0 9.9024 0C9.1204 0 8.48573 0.634667 8.48573 1.41667V6.23617C8.48573 7.37092 8.6104 8.5085 8.8569 9.61633L9.9024 12.75Z" fill="black"/>
</svg>`;

const PENCIL_ICON = require('../../assets/svg/pencil.svg');
const TRASH_ICON = require('../../assets/svg/trash.svg');

const EMPTY_CATALOG_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  textAlign: 'center' as const,
  color: '#000000',
};

const EMPTY_CATALOG_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 24,
  letterSpacing: 0,
  textAlign: 'center' as const,
  color: '#000000',
};

const DASHBOARD_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 18,
  lineHeight: 18,
  letterSpacing: 0,
  color: '#000000',
  textAlign: 'center' as const,
};

const STATUS_CARD_TEXT_REGULAR_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const STATUS_CARD_TEXT_MEDIUM_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const VISIBILITY_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const ADD_DRESS_BUTTON_TEXT_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textTransform: 'uppercase' as const,
  color: '#000000',
};

const SECTION_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  color: '#000000',
};

const SECTION_SUBTITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 24,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const DASHBOARD_SECTION_HEADING_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 18,
  lineHeight: 18,
  letterSpacing: 0,
  color: '#000000',
};

const VIEW_ALL_TEXT_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0.56,
  textTransform: 'uppercase' as const,
  color: '#000000',
};

const RECENT_ORDER_TITLE_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#000000',
};

const RECENT_ORDER_DESCRIPTION_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const CUSTOM_REQUEST_TITLE_STYLE = {
  fontFamily: 'Inter',
  fontWeight: '500' as const,
  fontSize: 16,
  lineHeight: 16,
  letterSpacing: 0,
  color: '#000000',
};

const CUSTOM_REQUEST_SUBTITLE_STYLE = {
  fontFamily: 'Inter',
  fontWeight: '400' as const,
  fontSize: 12,
  lineHeight: 12,
  letterSpacing: 0,
  color: '#6E6E6E',
};

const CATALOG_CARD_NAME_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '500' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 2,
  color: '#000000',
};

const CATALOG_CARD_ADDRESS_STYLE = {
  fontFamily: 'Helvetica Neue',
  fontWeight: '400' as const,
  fontSize: 14,
  lineHeight: 14,
  letterSpacing: 0,
  color: '#6E6E6E',
};

type BookingStatus = 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';

type Booking = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: BookingStatus;
  scheduled_for: string;
  language: string;
  location?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  dress_ids: number[];
  customer?: {
    id: number;
    full_name?: string | null;
    email: string;
    profile_image_url?: string | null;
  } | null;
  dresses?: Array<{
    id: number;
    name: string;
    price: number;
    colors?: string | null;
    sizes?: string | null;
    image_url?: string | null;
  }> | null;
  boutique?: {
    id: number;
    name?: string | null;
    location?: string | null;
  } | null;
};

function parseScheduledFor(value?: string | null) {
  if (!value || !value.trim()) return null;
  const match = value.match(/^[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthShort = match[2].toLowerCase();
  const hour12 = Number(match[3]);
  const minute = Number(match[4]);
  const suffix = match[5].toUpperCase();
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthShort);
  if (monthIndex < 0) return null;
  let hour24 = hour12 % 12;
  if (suffix === 'PM') hour24 += 12;
  const now = new Date();
  let year = now.getFullYear();
  let date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  if (date.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    year += 1;
    date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

function customerName(booking: Booking) {
  return booking.customer?.full_name || booking.customer?.email || 'Customer';
}

function bookingDressSummary(booking: Booking) {
  return booking.dresses?.length
    ? booking.dresses.map((dress) => dress.name).join(', ')
    : `${booking.dress_ids.length} selected dress(es)`;
}

function bookingTotalLabel(booking: Booking) {
  const total = booking.dresses?.reduce((sum, dress) => sum + (Number(dress.price) || 0), 0) ?? 0;
  if (total > 0) return `$${total.toLocaleString()}`;
  return `${booking.dress_ids.length} item${booking.dress_ids.length === 1 ? '' : 's'}`;
}

function formatCityCountry(location?: string | null) {
  const raw = (location || '').trim();
  if (!raw) return 'Location unavailable';

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const country = parts[parts.length - 1];
    const city =
      [...parts.slice(0, -1)].reverse().find((part) => !/\d/.test(part)) ||
      parts[parts.length - 2];
    return `${city}, ${country}`;
  }

  return raw;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good evening';
}

function bookingStatusLabel(status: BookingStatus) {
  switch (status) {
    case 'requested':
      return 'New';
    case 'accepted':
      return 'Accepted';
    case 'rescheduled':
      return 'Rescheduled';
    case 'completed':
      return 'Completed';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}


// Three-dot ping animation used while the dashboard data is loading. Each
// dot pulses scale + opacity on a staggered phase, looping forever — much
// more "alive" than a single spinner against the blank screen the user
// otherwise saw during the post-login fetch.
function PulsingDot({ delay }: { delay: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 480 }), withTiming(0, { duration: 480 })),
        -1,
        false,
      ),
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + progress.value * 0.65,
    transform: [{ scale: 0.8 + progress.value * 0.4 }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#111111',
          marginHorizontal: 5,
        },
        style,
      ]}
    />
  );
}

function DashboardLoader({ topInset }: { topInset: number }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingTop: topInset,
      }}
    >
      <Text
        style={{
          color: '#111111',
          fontSize: 18,
          fontWeight: '700',
          letterSpacing: 4,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        Shop Dashboard
      </Text>
      <View
        style={{
          width: 84,
          height: 2,
          backgroundColor: '#111111',
          opacity: 0.14,
          marginTop: 20,
          marginBottom: 28,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <PulsingDot delay={0} />
        <PulsingDot delay={160} />
        <PulsingDot delay={320} />
      </View>
      <Text
        style={{
          color: '#666666',
          fontSize: 11,
          letterSpacing: 1.8,
          textTransform: 'uppercase',
          textAlign: 'center',
          marginTop: 22,
        }}
      >
        Loading your shop
      </Text>
    </View>
  );
}

export default function BoutiqueDashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const boutiqueId = user?.boutique_id ?? null;
  
  const [loading, setLoading] = useState(true);
  const [boutiqueLoading, setBoutiqueLoading] = useState(true);
  const [dresses, setDresses] = useState<any[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isStoreVisible, setIsStoreVisible] = useState(true);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [boutique, setBoutique] = useState<{
    name?: string | null;
    location?: string | null;
    logo_url?: string | null;
  } | null>(null);
  const [timeGreeting, setTimeGreeting] = useState(getTimeGreeting);

  // Refresh the time-of-day greeting once a minute, but only while the app
  // is in the foreground. Without the AppState guard, the interval kept
  // ticking (and re-rendering the entire dashboard subtree) while the
  // partner had the app backgrounded — a small but constant battery /
  // perf cost. Also recompute on resume so a partner who left the app
  // open overnight sees "Good morning" right away instead of waiting up
  // to a minute for the next tick.
  useEffect(() => {
    setTimeGreeting(getTimeGreeting());
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id != null) return;
      id = setInterval(() => setTimeGreeting(getTimeGreeting()), 60_000);
    };
    const stop = () => {
      if (id != null) {
        clearInterval(id);
        id = null;
      }
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setTimeGreeting(getTimeGreeting());
        start();
      } else {
        stop();
      }
    });
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  const avatarUri = useMemo(() => {
    const fromUrl = user?.profile_image_url?.trim();
    if (fromUrl) return fromUrl;
    const fromLocal = user?.profile_image_uri?.trim();
    if (fromLocal) return fromLocal;
    const fromBoutique = boutique?.logo_url?.trim();
    return fromBoutique || null;
  }, [user?.profile_image_url, user?.profile_image_uri, boutique?.logo_url]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tracks the last successful dashboard refresh so the focus-effect can
  // skip refetches that arrive within the staleness window (see useFocusEffect
  // below). Mutation paths (delete dress, accept booking, etc.) call
  // fetchDashboardData directly and the stamp below keeps the gate honest.
  const lastDashboardFetchRef = useRef<number>(0);

  const fetchDashboardData = useCallback(async () => {
    if (!boutiqueId) {
      // Don't dismiss the loader yet — the user store is rehydrating
      // from SecureStore and boutiqueId will arrive shortly. The dedicated
      // useEffect below re-runs this fetch the moment boutiqueId lands,
      // so the loader stays up exactly until real data is in hand.
      setDresses([]);
      setBookings([]);
      return;
    }

    try {
      const [dressData, bookingData] = await Promise.all([
        api.get(`/dresses/?boutique_id=${boutiqueId}`),
        api.get('/bookings/partner'),
      ]);
      setDresses(Array.isArray(dressData) ? dressData : []);
      setBookings(Array.isArray(bookingData) ? (bookingData as Booking[]) : []);
      lastDashboardFetchRef.current = Date.now();
    } catch (error) {
      console.error('Failed to fetch boutique dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [boutiqueId]);

  const fetchBoutiqueVisibility = useCallback(async () => {
    if (!boutiqueId) {
      // Same reasoning as fetchDashboardData — wait for the user store to
      // rehydrate rather than rendering an empty dashboard.
      setIsStoreVisible(false);
      setBoutique(null);
      return;
    }

    try {
      const boutique = await api.get(`/boutiques/${boutiqueId}`);
      setIsStoreVisible(boutique.is_visible_to_customers ?? true);
      setBoutique(boutique);
    } catch (error) {
      console.error('Failed to fetch boutique visibility:', error);
    } finally {
      setBoutiqueLoading(false);
    }
  }, [boutiqueId]);

  // Re-run the dashboard fetches the moment the auth store rehydrates and
  // boutiqueId lands. Without this, the post-login race (Dashboard mounts
  // first, useFocusEffect fires, boutiqueId is still null, early-returns
  // never re-trigger) would leave the user staring at a blank dashboard
  // until they tab away and come back. The loader stays up until both
  // fetches complete because we no longer setLoading(false) on the
  // no-boutiqueId branch above.
  useEffect(() => {
    if (!boutiqueId) return;
    void fetchDashboardData();
    void fetchBoutiqueVisibility();
  }, [boutiqueId, fetchDashboardData, fetchBoutiqueVisibility]);

  // Safety valve: if the user account genuinely has no boutique attached
  // (i.e. boutiqueId stays null after the store has fully rehydrated), we
  // would otherwise show a loader forever. After 3 s of no boutiqueId,
  // give up and surface the empty state so the screen is at least
  // navigable.
  useEffect(() => {
    if (boutiqueId) return;
    const t = setTimeout(() => {
      setLoading(false);
      setBoutiqueLoading(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [boutiqueId]);

  const refreshCurrentUser = useCallback(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const fresh = await api.get('/users/me');
      setUser(fresh as any);
    } catch (error) {
      console.error('Failed to refresh current user:', error);
    }
  }, [setUser]);

  const handleStoreVisibilityChange = useCallback(
    async (value: boolean) => {
      if (!boutiqueId) {
        Alert.alert('Boutique Missing', 'Your account is not linked to a boutique yet.');
        return;
      }

      const previousValue = isStoreVisible;
      setIsStoreVisible(value);
      setIsUpdatingVisibility(true);

      try {
        await api.put(`/boutiques/${boutiqueId}`, {
          is_visible_to_customers: value,
        });
      } catch (error: any) {
        setIsStoreVisible(previousValue);
        Alert.alert('Update Failed', error.message || 'Could not update customer visibility.');
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [boutiqueId, isStoreVisible]
  );

  // Staleness gate: when the partner switches tabs (Bookings → Dashboard
  // and back) the dashboard previously fired 3 API calls on every focus,
  // even if they came back 2 seconds later. Skip the refetch if we
  // refreshed within the last 30s. Mutation paths (handleDeleteDress, etc.)
  // call fetchDashboardData directly and that path stamps the ref too, so
  // a focus event right after a mutation correctly skips its own refetch.
  const DASHBOARD_STALE_MS = 30_000;
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastDashboardFetchRef.current < DASHBOARD_STALE_MS) return;
      void refreshCurrentUser();
      fetchDashboardData();
      fetchBoutiqueVisibility();
    }, [refreshCurrentUser, fetchDashboardData, fetchBoutiqueVisibility])
  );

  // Subscription status banner. Poll on focus (cheap) so a partner whose
  // card got declined mid-month sees a Reactivate prompt right away.
  // We don't gate the dashboard itself — only publish actions on the
  // backend — so this banner is the partner's signal that "you're
  // still logged in but can't list dresses until you fix billing".
  const [subStatus, setSubStatus] = useState<'none' | 'active' | 'past_due' | 'canceled' | 'incomplete' | null>(null);
  const refreshSubStatus = useCallback(async () => {
    try {
      const res = (await api.get('/partners/subscription/status')) as { status?: string };
      const next = (res?.status ?? 'none') as 'none' | 'active' | 'past_due' | 'canceled' | 'incomplete';
      setSubStatus(next);
    } catch {
      // Best-effort.
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void refreshSubStatus();
    }, [refreshSubStatus])
  );

  // Manual pull-to-refresh — bypasses the 30s staleness gate so the
  // partner can force-pull fresh data on demand (e.g. after a buyer paid
  // on another device).
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshCurrentUser(),
        fetchDashboardData(),
        fetchBoutiqueVisibility(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCurrentUser, fetchDashboardData, fetchBoutiqueVisibility]);

  const selectedDressForDelete = dresses[0] ?? null;

  const handleDeleteDress = useCallback(async () => {
    if (!selectedDressForDelete?.id) return;
    setIsDeleting(true);
    try {
      await api.delete(`/dresses/${selectedDressForDelete.id}`);
      setDeleteModalOpen(false);
      setLoading(true);
      await fetchDashboardData();
    } catch (error: any) {
      Alert.alert('Delete Failed', error?.message || 'Could not delete this dress listing.');
    } finally {
      setIsDeleting(false);
    }
  }, [fetchDashboardData, selectedDressForDelete?.id]);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      const aDate =
        parseScheduledFor(a.scheduled_for)?.getTime() ||
        Date.parse(a.updated_at || a.created_at || '') ||
        0;
      const bDate =
        parseScheduledFor(b.scheduled_for)?.getTime() ||
        Date.parse(b.updated_at || b.created_at || '') ||
        0;
      return bDate - aDate;
    });
  }, [bookings]);

  const recentOrders = useMemo(() => sortedBookings.slice(0, 5), [sortedBookings]);
  const customRequests = useMemo(
    () => sortedBookings.filter((booking) => booking.status === 'requested').slice(0, 3),
    [sortedBookings]
  );
  const upcomingFittings = useMemo(() => {
    return sortedBookings
      .filter((booking) => ['accepted', 'rescheduled'].includes(booking.status))
      .sort((a, b) => {
        const aTime = parseScheduledFor(a.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
        const bTime = parseScheduledFor(b.scheduled_for)?.getTime() || Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 4);
  }, [sortedBookings]);

  // Keep the full-screen loader up until BOTH the dress/bookings fetch AND the
  // boutique fetch have settled. Without `boutiqueLoading` in the gate, the
  // header/greeting card briefly renders with empty boutique fields whenever
  // the dashboard-data fetch wins the race.
  const isInitialLoading = loading || boutiqueLoading;

  if (isInitialLoading) {
    return <DashboardLoader topInset={insets.top} />;
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#1A1A1A"
            colors={['#1A1A1A']}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 16 }} className="border-b border-[#F0F0F0]">
          <View className="items-center justify-center">
            <Text
              style={DASHBOARD_TITLE_STYLE}
            >
            Shop Dashboard
          </Text>
            {/* Notification bell intentionally hidden — push notifications are the
                single source of truth; no in-app inbox surface for partners right now. */}
          </View>
        </View>

        {/* Subscription nudge — only shown when billing needs the partner's
            attention. Active and 'none' (never subscribed, can't really
            happen post-signup but defensive) hide the banner. */}
        {subStatus === 'past_due' || subStatus === 'canceled' || subStatus === 'incomplete' ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <View className="bg-[#FFF4EC] border border-[#FFD3B7] px-4 py-3 flex-row items-start">
              <Ionicons name="alert-circle-outline" size={18} color="#C9491A" style={{ marginRight: 10, marginTop: 1 }} />
              <View className="flex-1">
                <Text className="text-[#C9491A] text-[12px] font-bold uppercase tracking-[0.5px] mb-1">
                  {subStatus === 'past_due' ? 'Payment failed' : 'Subscription needed'}
                </Text>
                <Text className="text-[#7A3E1C] text-[11px] leading-4 mb-3">
                  {subStatus === 'past_due'
                    ? 'Your last payment failed. Update your card to keep listings live.'
                    : 'Activate your plan to publish dresses and accept bookings.'}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => router.push('/subscribe' as any)}
                  className="bg-[#C9491A] px-3 py-2 self-start"
                >
                  <Text className="text-white text-[10px] uppercase tracking-[1px]">
                    {subStatus === 'past_due' ? 'Update payment' : 'Activate plan'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* Greeting + Shop Status Card (Figma-style) */}
        <View style={{ paddingHorizontal: 20, paddingTop: 24, marginBottom: 10 }}>
          <View className="border border-black" style={{ height: 186 }}>
            <View className="flex-row items-center justify-between" style={{ height: 58, paddingHorizontal: 14 }}>
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-sm bg-gray-100 overflow-hidden mr-3">
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <Image source={require('../../assets/images/avatar.png')} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  )}
                </View>
                <View>
                  <Text style={[STATUS_CARD_TEXT_REGULAR_STYLE, { marginBottom: 4 }]}>{timeGreeting}</Text>
                  <Text style={STATUS_CARD_TEXT_MEDIUM_STYLE}>
                    {user?.full_name?.trim() || user?.email || 'Partner'}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${isStoreVisible ? 'bg-green-500' : 'bg-black/40'}`} />
                <Text style={STATUS_CARD_TEXT_REGULAR_STYLE}>{isStoreVisible ? 'Online' : 'Offline'}</Text>
              </View>
            </View>

            <View className="h-px bg-black/10" />

            <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
              <Text style={[STATUS_CARD_TEXT_MEDIUM_STYLE, { textTransform: 'uppercase', marginBottom: 14 }]}>
                Shop Status
              </Text>

              <View className="border border-black justify-center" style={{ height: 72, paddingHorizontal: 14 }}>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 pr-4">
                    <View className="w-8 h-8 items-center justify-center mr-3">
                      <Ionicons name="eye-outline" size={18} color="black" />
                    </View>
                    <View className="flex-1">
                      <Text style={[STATUS_CARD_TEXT_MEDIUM_STYLE, { marginBottom: 6 }]}>
                        Set Customer Visibility
                      </Text>
                      <Text style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' as const, fontSize: 12, lineHeight: 14, letterSpacing: 0, color: '#6E6E6E' }}>Customers can see your shop</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleStoreVisibilityChange(!isStoreVisible)}
                    disabled={isUpdatingVisibility}
                    style={{
                      width: 30,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: isStoreVisible ? '#86EFAC' : '#D9D9D9',
                      justifyContent: 'center',
                      paddingHorizontal: 2,
                      opacity: isUpdatingVisibility ? 0.6 : 1,
                    }}
                  >
                    <View
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderColor: '#000000',
                        transform: [{ translateX: isStoreVisible ? 10 : 0 }],
                      }}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator color="black" />
          </View>
        ) : !boutiqueId ? (
          <View className="flex-1 items-center justify-center py-20 px-10">
            <Text className="text-lg font-bold mb-2 text-center">Boutique setup incomplete</Text>
            <Text className="text-xs text-black/40 text-center leading-5">
              This seller account is not linked to a boutique yet, so inventory cannot load.
            </Text>
          </View>
        ) : dresses.length === 0 ? (
          <View className="flex-1 items-center justify-center px-10" style={{ paddingTop: 28, paddingBottom: 80 }}>
            <View className="w-16 h-16 items-center justify-center mb-5">
              <SvgXml xml={DRESS_SVG} width={48} height={51} />
            </View>
            <Text className="mb-2" style={EMPTY_CATALOG_TITLE_STYLE}>
              Add Your First Catalog Dress
            </Text>
            <Text className="mb-8" style={EMPTY_CATALOG_SUBTITLE_STYLE}>
              Customers can see your catalog dresses and{'\n'}shop address.
            </Text>
            <TouchableOpacity 
              onPress={() => router.push('/add-dress')}
              className="border border-black items-center justify-center"
              style={{ width: 133, height: 48, paddingHorizontal: 24, paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              <Text style={ADD_DRESS_BUTTON_TEXT_STYLE}>Add Dress</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Dresses Catalog Listings */}
            <View style={{ paddingHorizontal: 20, marginBottom: 24, marginTop: 24 }}>
              <Text style={[SECTION_TITLE_STYLE, { marginBottom: 6 }]}>
                Dresses Catalog Listings
              </Text>
              <Text style={[SECTION_SUBTITLE_STYLE, { marginBottom: 24 }]}>
                Manage your bridal orders, designs, and customer{'\n'}requests.
              </Text>

              <View className="border border-[#EAEAEA] bg-white" style={{ height: 196, overflow: 'hidden' }}>
                <Image
                  source={
                    dresses[0]?.image_url
                      ? { uri: dresses[0].image_url }
                      : require('../../assets/images/Dashboard image 2.png')
                  }
                  style={{ width: '100%', height: 148 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View className="px-4 flex-row items-center justify-between" style={{ height: 48 }}>
                  <View className="flex-1 pr-4">
                    <Text style={CATALOG_CARD_NAME_STYLE} numberOfLines={1}>
                      {boutique?.name || 'Boutique Partner'}
                    </Text>
                    <Text style={[CATALOG_CARD_ADDRESS_STYLE, { marginTop: 6 }]} numberOfLines={1}>
                      {formatCityCountry(boutique?.location)}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <TouchableOpacity onPress={() => router.push('/business-profile-edit')} className="mr-3" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Image source={PENCIL_ICON} style={{ width: 16, height: 16 }} contentFit="contain" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setDeleteModalOpen(true)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={!selectedDressForDelete || isDeleting}
                      style={{ opacity: !selectedDressForDelete || isDeleting ? 0.4 : 1 }}
                    >
                      <Image source={TRASH_ICON} style={{ width: 16, height: 16 }} contentFit="contain" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
                <View className="flex-row justify-between items-center" style={{ marginBottom: 24 }}>
                    <Text style={DASHBOARD_SECTION_HEADING_STYLE}>Recent Orders</Text>
                    <TouchableOpacity
                      className="border border-black items-center justify-center"
                      style={{ width: 110, height: 38, paddingHorizontal: 14, paddingVertical: 4 }}
                      onPress={() => router.push('/(tabs)/bookings')}
                    >
                        <Text style={VIEW_ALL_TEXT_STYLE} numberOfLines={1}>View All</Text>
                    </TouchableOpacity>
                </View>
                <View style={{ gap: 14, minHeight: recentOrders.length > 0 ? 476 : undefined }}>
                    {recentOrders.length === 0 ? (
                        <View className="border border-[#EAEAEA] px-4 py-5">
                          <Text className="text-[11px] text-black/45">No recent booking activity yet.</Text>
                        </View>
                    ) : recentOrders.map((order) => (
                        <View
                          key={order.id}
                          className="flex-row items-center justify-between"
                          style={{ height: 84 }}
                        >
                            <View className="flex-row items-center flex-1">
                                <View className="overflow-hidden mr-4" style={{ width: 70, height: 70 }}>
                                    <Image
                                        source={
                                          order.dresses?.[0]?.image_url
                                            ? { uri: order.dresses[0].image_url }
                                            : require('../../assets/images/Dashboard image 2.png')
                                        }
                                        style={{ width: '100%', height: '100%' }}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center" style={{ marginBottom: 8 }}>
                                        <Text style={RECENT_ORDER_TITLE_STYLE} numberOfLines={1}>{customerName(order)}</Text>
                                    </View>
                                    <Text style={RECENT_ORDER_DESCRIPTION_STYLE} numberOfLines={1}>
                                      {bookingDressSummary(order)} · {order.scheduled_for}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 40 }}>
                <Text style={[DASHBOARD_SECTION_HEADING_STYLE, { marginBottom: 24 }]}>New Custom Requests</Text>
                <View style={{ gap: 14 }}>
                    {customRequests.length === 0 ? (
                      <View className="border border-[#EAEAEA] p-4 bg-white">
                        <Text className="text-[11px] text-black/45">No new custom requests right now.</Text>
                      </View>
                    ) : customRequests.map((request) => (
                        <View
                          key={request.id}
                          className="border border-black bg-white"
                          style={{ height: 164, paddingHorizontal: 18, paddingVertical: 16 }}
                        >
                            <Text style={[CUSTOM_REQUEST_TITLE_STYLE, { marginBottom: 10 }]} numberOfLines={1}>{customerName(request)}</Text>
                            <Text style={[CUSTOM_REQUEST_SUBTITLE_STYLE, { marginBottom: 12 }]} numberOfLines={1}>
                              {request.dresses?.[0]?.name || (request.appointment_type === 'video' ? 'Video consultation request' : 'Custom Bridesmaid Dress')}
                            </Text>

                            <View className="flex-row flex-wrap gap-2 mb-4">
                                {[
                                  request.scheduled_for ? `Time: ${request.scheduled_for}` : null,
                                  request.language ? `Language: ${request.language}` : null,
                                  request.dresses?.[0]?.name ? `Dress: ${request.dresses[0].name}` : `${request.dress_ids.length} dress(es)`,
                                ].filter(Boolean).map((tag) => (
                                    <View key={tag} className="border border-[#D9D9D9] rounded-full px-2.5 py-1">
                                        <Text className="text-[8px] text-black/60">{tag}</Text>
                                    </View>
                                ))}
                            </View>

                            <View className="flex-row gap-3">
                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/(tabs)/bookings')}
                                    className="flex-1 bg-black rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-white">
                                        Review Request
                                    </Text>
                                </TouchableOpacity>
                                {/* <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => router.push('/notifications')}
                                    className="flex-1 border border-[#D9D9D9] rounded-full py-3 items-center justify-center"
                                >
                                    <Text className="text-[9px] font-bold uppercase tracking-[1.2px] text-black/70">
                                        Message Bride
                                    </Text>
                                </TouchableOpacity> */}
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ paddingHorizontal: 20, marginBottom: 48 }}>
                <View className="flex-row justify-between items-center" style={{ marginBottom: 24 }}>
                    <Text style={DASHBOARD_SECTION_HEADING_STYLE}>Upcoming Fittings</Text>
                    <TouchableOpacity
                      className="border border-black items-center justify-center"
                      style={{ width: 147, height: 38, paddingHorizontal: 14, paddingVertical: 4 }}
                      onPress={() => router.push('/(tabs)/bookings')}
                    >
                        <Text style={VIEW_ALL_TEXT_STYLE}>View Calendar</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ gap: 14 }}>
                    {upcomingFittings.length === 0 ? (
                      <View className="border border-[#EAEAEA] px-4 py-5">
                        <Text className="text-[11px] text-black/45">No upcoming fittings scheduled yet.</Text>
                      </View>
                    ) : upcomingFittings.map((fitting) => (
                        <View key={fitting.id} className="flex-row items-center justify-between" style={{ height: 64 }}>
                            <View className="flex-row items-center flex-1">
                                <View className="bg-[#F7F7F7] mr-4 overflow-hidden" style={{ width: 48, height: 48 }}>
                                  {fitting.customer?.profile_image_url ? (
                                    <Image
                                      source={{ uri: fitting.customer.profile_image_url }}
                                      style={{ width: '100%', height: '100%' }}
                                      contentFit="cover"
                                      cachePolicy="memory-disk"
                                    />
                                  ) : null}
                                </View>
                                <View className="flex-1">
                                    <Text style={[RECENT_ORDER_TITLE_STYLE, { marginBottom: 8 }]} numberOfLines={1}>{customerName(fitting)}</Text>
                                    <Text style={RECENT_ORDER_DESCRIPTION_STYLE} numberOfLines={1}>
                                      {fitting.appointment_type === 'video' ? 'Video fitting' : 'Store fitting'}
                                    </Text>
                                </View>
                            </View>

                            <View className="flex-row items-center">
                                <Ionicons name="time-outline" size={12} color="#EB5757" />
                                <Text style={[RECENT_ORDER_DESCRIPTION_STYLE, { color: '#EB5757', marginLeft: 6 }]} numberOfLines={1}>{fitting.scheduled_for}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>
          </>
        )}
      </ScrollView>

      <FigmaConfirmModal
        visible={deleteModalOpen}
        onClose={() => (isDeleting ? null : setDeleteModalOpen(false))}
        title="Delete Dress Listing?"
        description="Are you sure you want to delete this dress form your catalog? This action can not be undone and the listing will no longer be visible to brides."
        iconName="trash"
        tone="danger"
        leftButtonText={isDeleting ? 'DELETING...' : 'ACCEPT'}
        onLeftPress={() => (isDeleting ? null : handleDeleteDress())}
        rightButtonText="CANCEL"
        onRightPress={() => (isDeleting ? null : setDeleteModalOpen(false))}
      />
    </View>
  );
}
