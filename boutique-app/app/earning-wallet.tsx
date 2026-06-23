import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { api } from '@shared/api/api';


type ConnectStatus = {
  onboarded: boolean;
  stripe_account_id?: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  available_balance_cents: number;
  pending_balance_cents: number;
};

type PartnerOrder = {
  id: number;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
};


function formatEur(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}


export default function EarningWalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, ordersRes] = await Promise.all([
        api.get('/partners/stripe/status') as Promise<ConnectStatus>,
        api.get('/orders/partner').catch(() => [] as PartnerOrder[]) as Promise<PartnerOrder[]>,
      ]);
      setStatus(statusRes);
      setOrders(ordersRes ?? []);
    } catch (e: any) {
      // Status endpoint failing once shouldn't blow up the whole screen —
      // surface a soft default so the CTA stays usable.
      setStatus({
        onboarded: false,
        charges_enabled: false,
        payouts_enabled: false,
        available_balance_cents: 0,
        pending_balance_cents: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh whenever the screen focuses — covers the case where the partner
  // came back from the Stripe onboarding webview.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh();
    }, [refresh]),
  );

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      const { url } = (await api.post('/partners/stripe/connect-link', {})) as { url: string };
      // Open in an in-app browser; closing it (or finishing onboarding) will
      // pop us back here and useFocusEffect will re-poll status.
      await WebBrowser.openBrowserAsync(url);
      await refresh();
    } catch (e: any) {
      Alert.alert('Could not start Stripe onboarding', e?.message || 'Try again in a moment.');
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenDashboard = async () => {
    if (openingDashboard) return;
    setOpeningDashboard(true);
    try {
      const { url } = (await api.get('/partners/stripe/dashboard-link')) as { url: string };
      await WebBrowser.openBrowserAsync(url);
    } catch (e: any) {
      Alert.alert('Could not open Stripe dashboard', e?.message || 'Try again in a moment.');
    } finally {
      setOpeningDashboard(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 36 }}
      >
        <View className="px-5">
          <TouchableOpacity onPress={() => router.back()} className="mb-10">
            <Ionicons name="arrow-back" size={18} color="black" />
          </TouchableOpacity>

          <Text
            className="text-[18px] text-black mb-6"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '400' }}
          >
            Wallet Details
          </Text>

          {loading ? (
            <View className="py-24 items-center">
              <ActivityIndicator color="black" />
            </View>
          ) : !status?.onboarded ? (
            <ConnectCTA onPress={handleConnect} connecting={connecting} chargesEnabled={!!status?.charges_enabled} />
          ) : (
            <>
              <View className="border border-[#1A1A1A] px-6 py-5 mb-6">
                <Text className="text-[12px] uppercase tracking-[1px] text-black/55 mb-2">
                  Available Balance
                </Text>
                <Text
                  className="text-[26px] text-black"
                  style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}
                >
                  {formatEur(status.available_balance_cents)}
                </Text>
                {status.pending_balance_cents > 0 ? (
                  <Text className="text-[11px] text-black/40 mt-2">
                    Pending: {formatEur(status.pending_balance_cents)}
                  </Text>
                ) : null}
              </View>

              <View className="flex-row mb-6">
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleOpenDashboard}
                  disabled={openingDashboard}
                  className="flex-1 bg-black py-4 items-center justify-center mr-2"
                  style={{ opacity: openingDashboard ? 0.5 : 1 }}
                >
                  {openingDashboard ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-[11px] uppercase tracking-[1px] text-white">
                      Withdraw / Manage
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleConnect}
                  className="flex-1 border border-black py-4 items-center justify-center ml-2"
                >
                  <Text className="text-[11px] uppercase tracking-[1px] text-black">Update Bank</Text>
                </TouchableOpacity>
              </View>

              <Text
                className="text-[16px] text-black mb-4"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                Transactions
              </Text>

              {orders.length === 0 ? (
                <Text className="text-[12px] text-black/45 py-6">
                  No orders yet. Once a buyer pays, the order will appear here and the funds will land in your bank automatically.
                </Text>
              ) : (
                <View>
                  {orders.map((order) => (
                    <View key={order.id} className="border border-[#1A1A1A] p-4 mb-4 flex-row items-center">
                      <View className="w-12 h-12 bg-black items-center justify-center mr-4">
                        <Ionicons
                          name={order.status === 'paid' ? 'arrow-down-outline' : 'time-outline'}
                          size={18}
                          color="white"
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-[13px] text-black"
                          style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                        >
                          Order #{order.id}
                        </Text>
                        <Text className="text-[12px] text-black/45 mt-1">
                          {new Date(order.created_at).toLocaleString()}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text
                          className="text-[13px] text-black mb-3"
                          style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}
                        >
                          {formatEur(order.total_cents)}
                        </Text>
                        <View className="bg-black rounded-full px-4 py-1.5">
                          <Text className="text-[10px] text-white uppercase">{order.status}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


function ConnectCTA({
  onPress,
  connecting,
  chargesEnabled,
}: {
  onPress: () => void;
  connecting: boolean;
  chargesEnabled: boolean;
}) {
  return (
    <View className="border border-[#1A1A1A] px-6 py-8 mb-6">
      <Text
        className="text-[16px] text-black mb-3"
        style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
      >
        Connect your bank account
      </Text>
      <Text className="text-[12px] text-black/55 leading-5 mb-6">
        {chargesEnabled
          ? 'Almost there — Stripe still needs a couple of details before payouts can go to your bank. Tap below to finish.'
          : 'Dress Live uses Stripe to collect payments from buyers and pay you out automatically. The setup takes about two minutes.'}
      </Text>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        disabled={connecting}
        className="w-full bg-black py-4 items-center justify-center"
        style={{ opacity: connecting ? 0.5 : 1 }}
      >
        {connecting ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-[11px] uppercase tracking-[1px]">
            {chargesEnabled ? 'Finish setup' : 'Connect with Stripe'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
