import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '@shared/api/api';


type Plan = 'monthly' | 'annual';

const PLANS: Record<Plan, { label: string; price: string; cadence: string; note?: string }> = {
  monthly: { label: 'Monthly', price: '€59.90', cadence: 'per month' },
  annual: { label: 'Annual', price: '€90.90', cadence: 'per year', note: 'Saves ~25% vs monthly · Most popular' },
};

type CheckoutResponse = {
  subscription_id: string;
  client_secret: string;
  publishable_key: string;
  customer_id: string;
  plan: Plan;
};


export default function SubscribeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const params = useLocalSearchParams<{ plan?: string }>();

  const initialPlan: Plan = useMemo(() => {
    const p = String(params.plan ?? '').toLowerCase();
    return p === 'annual' ? 'annual' : 'monthly';
  }, [params.plan]);

  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [working, setWorking] = useState(false);

  // Surface "already active" early so a partner who hits this screen
  // accidentally (e.g. via back button after onboarding) gets bounced
  // forward instead of seeing a confusing Pay button.
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await api.get('/partners/subscription/status')) as { status: string };
        if (!cancelled && res?.status === 'active') {
          router.replace('/(tabs)' as any);
          return;
        }
      } catch {
        // Best-effort — if status check fails just let the partner try
        // the checkout normally; the backend will 409 if they're active.
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const planConfig = PLANS[plan];

  const handleActivate = useCallback(async () => {
    if (working) return;
    setWorking(true);
    try {
      // 1. Backend creates the Customer + Subscription, returns the
      //    first invoice's PaymentIntent client_secret.
      const data = (await api.post('/partners/subscription/checkout', { plan })) as CheckoutResponse;

      // 2. Open PaymentSheet against the platform account (no
      //    stripeAccountId here — this is the platform charging the
      //    partner directly, not a Connect destination charge).
      const initRes = await initPaymentSheet({
        merchantDisplayName: 'Dress Live Partner',
        paymentIntentClientSecret: data.client_secret,
        customerId: data.customer_id,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: true },
      });
      if (initRes.error) {
        throw new Error(initRes.error.message || 'Could not initialize payment.');
      }

      const presentRes = await presentPaymentSheet();
      if (presentRes.error) {
        if (presentRes.error.code === 'Canceled') return;
        throw new Error(presentRes.error.message || 'Payment failed.');
      }

      // 3. Success — Stripe will fire customer.subscription.updated to
      //    our webhook which flips subscription_status=active. Bounce
      //    the partner straight into the app; the dashboard's own
      //    status poll will pick up the active state momentarily.
      router.replace('/(tabs)' as any);
    } catch (err: any) {
      Alert.alert('Subscription failed', err?.message || 'Something went wrong.');
    } finally {
      setWorking(false);
    }
  }, [plan, working, initPaymentSheet, presentPaymentSheet, router]);

  if (checking) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator color="#1A1A1A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 36 }}
      >
        <View className="px-6">
          <TouchableOpacity onPress={() => router.back()} className="mb-10" disabled={working}>
            <Ionicons name="close" size={22} color="black" />
          </TouchableOpacity>

          <Text
            className="text-black mb-3"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 24, lineHeight: 28 }}
          >
            Activate your plan
          </Text>
          <Text
            className="text-black/60 mb-8"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 14, lineHeight: 20 }}
          >
            A subscription is required to publish dresses, accept bookings, and run live fittings.
          </Text>

          <View className="gap-3 mb-8">
            {(['monthly', 'annual'] as const).map((id) => {
              const isSelected = plan === id;
              const cfg = PLANS[id];
              return (
                <TouchableOpacity
                  key={id}
                  activeOpacity={0.85}
                  onPress={() => setPlan(id)}
                  className="border"
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 18,
                    borderColor: isSelected ? '#000000' : '#CFCFCF',
                  }}
                  disabled={working}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-row items-center">
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderWidth: 1,
                          borderColor: '#000000',
                          marginRight: 14,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isSelected ? <View style={{ width: 6, height: 6, backgroundColor: '#000000' }} /> : null}
                      </View>
                      <View>
                        <Text
                          className="text-black"
                          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 16, lineHeight: 18 }}
                        >
                          {cfg.label}
                        </Text>
                        <Text className="text-black/55 text-[12px] mt-1">{cfg.cadence}</Text>
                      </View>
                    </View>
                    <Text
                      className="text-black"
                      style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 16 }}
                    >
                      {cfg.price}
                    </Text>
                  </View>
                  {cfg.note ? (
                    <Text className="text-black/45 text-[11px] mt-3 ml-7">{cfg.note}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View className="bg-[#F9F9F9] border border-[#EEEEEE] px-4 py-3 mb-8">
            <Text className="text-black/55 text-[11px] leading-5">
              You will be charged {planConfig.price} {planConfig.cadence} starting today. Cancel any time from your Stripe billing portal.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleActivate}
            disabled={working}
            className="bg-black items-center justify-center"
            style={{ height: 52, opacity: working ? 0.5 : 1 }}
          >
            {working ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-[12px] uppercase tracking-[1.5px]">
                Activate {planConfig.label} — {planConfig.price}
              </Text>
            )}
          </TouchableOpacity>

          <View className="items-center mt-6">
            <Text className="text-black/35 text-[10px]">Payments secured by Stripe</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
