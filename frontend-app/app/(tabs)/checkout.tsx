import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '@shared/api/api';
import { useCartStore } from '@/store/useCartStore';
import { useLastOrderStore } from '@/store/useLastOrderStore';
import { priceStringToNumber } from '@/utils/money';


type CreateOrderResponse = {
  order: {
    id: number;
    total_cents: number;
    subtotal_cents: number;
    service_fee_cents: number;
    boutique_id: number;
    currency: string;
  };
  client_secret: string;
  publishable_key: string;
  stripe_account_id: string;
};


export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const [paying, setPaying] = useState(false);

  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected),
    [cartItems]
  );
  const totalQuantity = useMemo(
    () => selectedItems.reduce((total, item) => total + item.quantity, 0),
    [selectedItems]
  );
  // Estimate from the numeric price stored on the cart item (falling back to a
  // robust parse of the display string for legacy persisted items). The real
  // charge is always the backend PaymentIntent amount; this is just the
  // pre-payment estimate shown on the button.
  const subtotal = useMemo(
    () =>
      selectedItems.reduce((total, item) => {
        const unit = item.priceValue ?? priceStringToNumber(item.price);
        return total + unit * item.quantity;
      }, 0),
    [selectedItems]
  );
  const serviceFee = selectedItems.length > 0 ? 15 : 0;
  const total = subtotal + serviceFee;
  const isEmpty = selectedItems.length === 0;

  // All selected items must come from the same boutique — Stripe Connect
  // routes funds to ONE destination per PaymentIntent. If the cart mixes
  // boutiques we surface a clear error rather than silently charging the
  // first one.
  const boutiqueIds = useMemo(
    () => Array.from(new Set(selectedItems.map((i) => i.boutiqueId).filter((x): x is number => typeof x === 'number'))),
    [selectedItems]
  );
  const mixedBoutiques = boutiqueIds.length > 1;
  const boutiqueId = boutiqueIds[0] ?? null;

  const handlePay = async () => {
    if (paying || isEmpty) return;
    if (!boutiqueId) {
      Alert.alert(
        'Cart issue',
        'These items are missing a boutique. Please remove and re-add them.',
      );
      return;
    }
    if (mixedBoutiques) {
      Alert.alert(
        'One boutique per checkout',
        'Your cart has dresses from multiple boutiques. Check out one boutique at a time.',
      );
      return;
    }

    setPaying(true);
    try {
      const dressItems = selectedItems
        .map((it) => ({
          dress_id: Number(it.id),
          quantity: it.quantity,
        }))
        .filter((it) => Number.isFinite(it.dress_id));
      if (dressItems.length === 0) {
        throw new Error('No valid dresses in selection.');
      }

      // 1. Backend creates the Order + Stripe PaymentIntent
      const data = (await api.post('/orders/', {
        boutique_id: boutiqueId,
        items: dressItems,
      })) as CreateOrderResponse;

      // 2. Init PaymentSheet with the client_secret
      const initRes = await initPaymentSheet({
        merchantDisplayName: 'Dress Live',
        paymentIntentClientSecret: data.client_secret,
        // Stripe Connect: the SDK needs to know which connected account
        // this PaymentIntent lives on so Apple/Google Pay show the right
        // merchant name.
        stripeAccountId: data.stripe_account_id,
        // Stripe shows Card + Apple Pay + Google Pay automatically when
        // they're available on the device.
        applePay: { merchantCountryCode: 'FR' },
        googlePay: { merchantCountryCode: 'FR', testEnv: true },
        allowsDelayedPaymentMethods: false,
      });
      if (initRes.error) {
        throw new Error(initRes.error.message || 'Could not initialize payment.');
      }

      // 3. Show the sheet
      const presentRes = await presentPaymentSheet();
      if (presentRes.error) {
        // User canceled is not an error worth alerting on
        const code = presentRes.error.code;
        if (code === 'Canceled') {
          return;
        }
        throw new Error(presentRes.error.message || 'Payment failed.');
      }

      // 4. Success — webhook will mark the order paid server-side. Snapshot the
      // order (backend-authoritative cents totals + items + real id) for the
      // confirmation screen BEFORE clearing the cart, then clear and navigate.
      useLastOrderStore.getState().setOrder({
        orderId: data.order.id,
        currency: data.order.currency,
        subtotalCents: data.order.subtotal_cents,
        serviceFeeCents: data.order.service_fee_cents,
        totalCents: data.order.total_cents,
        items: selectedItems.map((it) => ({
          id: it.id,
          name: it.name,
          quantity: it.quantity,
          price: it.price,
          imageUrl: it.imageUrl ?? null,
        })),
      });
      clearCart();
      router.replace({
        pathname: '/(tabs)/order-summary',
        params: {
          type: 'confirmed',
          orderId: String(data.order.id),
        },
      } as any);
    } catch (err: any) {
      Alert.alert('Payment failed', err?.message || 'Something went wrong.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View
        className="px-6 flex-row items-center border-b border-[#F0F0F0] pb-4"
        style={{ paddingTop: insets.top + 10 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-lg font-medium">Checkout</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-6 pt-6">
        {isEmpty ? (
          <View className="items-center justify-center py-24">
            <Feather name="shopping-cart" size={56} color="black" style={{ opacity: 0.2 }} />
            <Text className="text-black text-base font-medium mt-6 mb-2">No items selected</Text>
            <Text className="text-black/40 text-[11px] text-center leading-5 px-8">
              Select at least one cart item before continuing to checkout.
            </Text>
            <TouchableOpacity
              onPress={() => router.replace('/(tabs)/cart')}
              className="mt-8 border-b border-black pb-1"
            >
              <Text className="text-black text-xs font-bold uppercase tracking-[1px]">Return to Cart</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Order Summary */}
            <Text className="text-black text-[12px] font-bold uppercase mb-4 tracking-[0.5px]">
              Order Summary ({totalQuantity})
            </Text>
            <View className="mb-10 border-b border-[#F0F0F0]">
              {selectedItems.map((item) => (
                <View key={item.id} className="flex-row items-center mb-6 pb-6">
                  <Image
                    source={item.imageUrl ? { uri: item.imageUrl } : require('@/assets/images/Dashboard image 3.png')}
                    style={{ width: 80, height: 100, borderRadius: 2 }}
                    contentFit="cover"
                  />
                  <View className="ml-6 flex-1">
                    <Text className="text-black text-sm font-medium mb-1">{item.name}</Text>
                    <Text className="text-black/40 text-[12px] mb-2">Quantity {item.quantity}</Text>
                    <Text className="text-black text-sm font-bold">{item.price}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View className="mb-6 rounded-sm border border-[#F0F0F0] bg-[#F9F9F9] p-4">
              <View className="flex-row justify-between mb-2">
                <Text className="text-black/50 text-[12px]">Subtotal</Text>
                <Text className="text-black text-[12px]">{subtotal.toFixed(0)} EUR</Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-black/50 text-[12px]">Service Fee</Text>
                <Text className="text-black text-[12px]">{serviceFee.toFixed(0)} EUR</Text>
              </View>
              <View className="flex-row justify-between pt-2 border-t border-[#ECECEC]">
                <Text className="text-black text-[12px] font-bold uppercase">Total</Text>
                <Text className="text-black text-[12px] font-bold">{total.toFixed(0)} EUR</Text>
              </View>
            </View>

            {mixedBoutiques ? (
              <View className="mb-6 p-4 bg-[#FFF4EC] border border-[#FFDAB8]">
                <Text className="text-[#C9491A] text-[11px] font-bold uppercase tracking-[0.5px] mb-1">
                  One boutique per checkout
                </Text>
                <Text className="text-[#7A3E1C] text-[11px] leading-4">
                  Your selection includes dresses from multiple boutiques. Please check out one boutique at a time.
                </Text>
              </View>
            ) : null}

            {/* Pay Button — opens Stripe PaymentSheet (Card / Apple Pay / Google Pay) */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handlePay}
              disabled={paying || mixedBoutiques}
              className={`w-full py-4 items-center justify-center mb-10 ${paying || mixedBoutiques ? 'bg-black/40' : 'bg-black'}`}
            >
              {paying ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">
                  Pay {total.toFixed(0)} EUR
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* No Returns Policy */}
        <View className="bg-[#FFF8F2] p-4 flex-row items-start border border-[#FFF0E0] mb-20">
          <Ionicons name="alert-circle-outline" size={20} color="#FF9500" style={{ marginRight: 12, marginTop: 2 }} />
          <View className="flex-1">
            <Text className="text-[#FF9500] text-[12px] font-bold mb-1 uppercase tracking-[0.5px]">No Returns Policy</Text>
            <Text className="text-black/60 text-[11px] leading-4">
              Since this dress is made-to-order based on your unique measurements, we cannot accept returns or exchanges once production begins.
            </Text>
          </View>
        </View>

        {/* Secure Message */}
        <View className="items-center flex-row justify-center pb-20">
          <Feather name="lock" size={14} color="black" style={{ opacity: 0.3, marginRight: 8 }} />
          <Text className="text-black/30 text-[10px]">Payments are processed securely by Stripe</Text>
        </View>
      </ScrollView>
    </View>
  );
}
