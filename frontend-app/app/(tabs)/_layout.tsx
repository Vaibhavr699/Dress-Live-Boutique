import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { useCartStore } from '@/store/useCartStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EdgeSwipeBackProvider } from '@/components/ui/edge-swipe-back';

const HOME_ICON = require('../../assets/svg/Home.svg');
const CART_ICON = require('../../assets/svg/Cart.svg');
const WISHLIST_ICON = require('../../assets/svg/Wishlist.svg');
const BOOKING_ICON = require('../../assets/svg/Booking.svg');
const PROFILE_ICON = require('../../assets/svg/Profile.svg');

const TabIcon = ({
  name,
  color,
  focused,
  badgeCount = 0,
}: {
  name: string,
  color: string,
  focused: boolean,
  badgeCount?: number,
}) => {
  const getIconSource = () => {
    switch (name) {
      case 'home': return HOME_ICON;
      case 'cart': return CART_ICON;
      case 'wishlist': return WISHLIST_ICON;
      case 'booking': return BOOKING_ICON;
      case 'profile': return PROFILE_ICON;
      default: return HOME_ICON;
    }
  };

  return (
    <View style={styles.container}>
      <Image 
        source={getIconSource()} 
        style={{ width: 22, height: 22 }}
        tintColor={focused ? "#1A1A1A" : "#1A1A1A50"}
        contentFit="contain"
      />
      {badgeCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
        </View>
      ) : null}
    </View>
  );
};


const CustomLabel = ({ title, focused }: { title: string, focused: boolean }) => (
  <View style={styles.labelContainer}>
    <Text 
      style={[
        styles.labelText, 
        { 
          fontFamily: 'PlayfairDisplay-Regular',
          color: focused ? '#1A1A1A' : '#1A1A1A50' 
        }
      ]}
    >
      {title}
    </Text>
    {focused && <View style={styles.dot} />}
  </View>
);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const cartCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + item.quantity, 0)
  );
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <EdgeSwipeBackProvider>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1A1A1A',
        tabBarInactiveTintColor: '#1A1A1A50',
        headerShown: false,
        animation: 'shift',
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 62 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
          backgroundColor: '#FFF',
          borderTopWidth: 1,
          borderTopColor: '#F0F0F0',
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 0,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: ({ focused }) => <CustomLabel title="Home" focused={focused} />,
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          tabBarLabel: ({ focused }) => <CustomLabel title="Cart" focused={focused} />,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="cart" color={color} focused={focused} badgeCount={cartCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          tabBarLabel: ({ focused }) => <CustomLabel title="Wishlist" focused={focused} />,
          tabBarIcon: ({ color, focused }) => <TabIcon name="wishlist" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="booking"
        options={{
          tabBarLabel: ({ focused }) => <CustomLabel title="Booking" focused={focused} />,
          tabBarIcon: ({ color, focused }) => <TabIcon name="booking" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: ({ focused }) => <CustomLabel title="Profile" focused={focused} />,
          tabBarIcon: ({ color, focused }) => <TabIcon name="profile" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="boutique-details"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="product-details"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="video-call"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="checkout"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="booking-calendar"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="order-summary"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="edit-address"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="my-measurements"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="payment-methods"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="payment-details"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="security-password"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="verify-password"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="delete-account"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="confirm-delete"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="ai-try-on"
        options={{
          href: null,
          tabBarStyle: { display: 'none' },
        }}
      />

    </Tabs>
    </EdgeSwipeBackProvider>

  );
}

const styles = StyleSheet.create({
  container: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 10,
  },
  labelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: -0.24,
    textAlign: 'center',
    lineHeight: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#1A1A1A',
    marginTop: 4,
  }
});
