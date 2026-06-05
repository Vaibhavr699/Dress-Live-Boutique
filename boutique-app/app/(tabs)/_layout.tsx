import React from 'react';
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { useAuthStore } from '@shared/store/useAuthStore';

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 4, minHeight: 28 }}>
      <Text
        style={{
          fontFamily: 'PlayfairDisplay-Regular',
          fontWeight: '400',
          fontStyle: 'normal',
          fontSize: 12,
          lineHeight: 12,
          letterSpacing: -0.24,
          textAlign: 'center',
          color: focused ? '#1A1A1A' : '#1A1A1A90',
        }}
      >
        {label}
      </Text>
      <View style={{ marginTop: 6, width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
        {focused ? (
          <Svg width={8} height={8} viewBox="0 0 8 8">
            <Circle cx="4" cy="4" r="3" fill="#1A1A1A" />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

function HomeIcon({ focused }: { focused: boolean }) {
  const color = focused ? '#1A1A1A' : '#1A1A1A90';

  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M0.928874 9.75667C0.612207 7.55917 0.453874 6.46 0.904707 5.52083C1.35554 4.58167 2.31387 4.01 4.23137 2.86833L5.38554 2.18083C7.12554 1.14333 7.99721 0.625 8.95887 0.625C9.92054 0.625 10.7914 1.14333 12.5322 2.18083L13.6864 2.86833C15.603 4.01 16.5622 4.58167 17.013 5.52083C17.4639 6.46 17.3047 7.55917 16.988 9.75667L16.7564 11.3708C16.3505 14.1942 16.1472 15.605 15.168 16.4483C14.1889 17.2917 12.753 17.2917 9.88054 17.2917H8.03721C5.16471 17.2917 3.72887 17.2917 2.74971 16.4483C1.77054 15.605 1.56721 14.1942 1.16137 11.3708L0.928874 9.75667Z"
        stroke={color}
        strokeWidth={1.25}
      />
      <Path d="M11.459 13.958H6.45898" stroke={color} strokeWidth={1.25} strokeLinecap="round" />
    </Svg>
  );
}

function CalendarIcon({ focused }: { focused: boolean }) {
  const color = focused ? '#1A1A1A' : '#1A1A1A90';

  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path d="M5.83398 3.33301V2.08301" stroke={color} strokeLinecap="round" />
      <Path d="M14.166 3.33301V2.08301" stroke={color} strokeLinecap="round" />
      <Path d="M7.5 12.083L8.75 10.833V14.1663" stroke={color} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M10.834 13.333V11.6663C10.834 11.2061 11.2071 10.833 11.6673 10.833C12.1276 10.833 12.5007 11.2061 12.5007 11.6663V13.333C12.5007 13.7933 12.1276 14.1663 11.6673 14.1663C11.2071 14.1663 10.834 13.7933 10.834 13.333Z"
        stroke={color}
        strokeLinecap="round"
      />
      <Path d="M17.916 7.5H13.8535H8.95768M1.66602 7.5H4.89518" stroke={color} strokeLinecap="round" />
      <Path
        d="M11.666 18.333H8.33268C5.18998 18.333 3.61864 18.333 2.64232 17.3567C1.66602 16.3804 1.66602 14.809 1.66602 11.6663V9.99967C1.66602 6.85697 1.66602 5.28563 2.64232 4.30932C3.61864 3.33301 5.18998 3.33301 8.33268 3.33301H11.666C14.8087 3.33301 16.3801 3.33301 17.3563 4.30932C18.3327 5.28563 18.3327 6.85697 18.3327 9.99967V11.6663C18.3327 14.809 18.3327 16.3804 17.3563 17.3567C16.812 17.901 16.0828 18.1418 14.9993 18.2484"
        stroke={color}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CatalogIcon({ focused }: { focused: boolean }) {
  const color = focused ? '#1A1A1A' : '#1A1A1A90';

  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <G clipPath="url(#catalogClip)">
        <Path
          d="M18.3741 12.69L13.3833 7.79L13.8808 5.92417C14.0716 5.0625 14.1683 4.18083 14.1683 3.30333V0.416667C14.1683 0.186667 13.9816 0 13.7516 0C13.5216 0 13.3349 0.186667 13.3349 0.416667V2.53C11.8016 2.675 10.5483 3.56583 10.0016 4.02417C9.45495 3.56583 8.20161 2.675 6.66828 2.53V0.416667C6.66828 0.186667 6.48161 0 6.25161 0C6.02161 0 5.83495 0.186667 5.83495 0.416667V3.3025C5.83495 4.18417 5.93161 5.06583 6.12661 5.94083L6.61995 7.78917L1.64995 12.6692C0.748281 13.4358 0.567448 14.7475 1.23078 15.72C2.97328 18.28 6.49745 20 10.0008 20C13.5041 20 17.0291 18.2808 18.7708 15.72C19.4341 14.7475 19.2533 13.4358 18.3733 12.6892L18.3741 12.69ZM10.0008 5C10.1074 5 10.2141 4.96 10.2958 4.87833C10.3099 4.86417 11.6466 3.57333 13.3308 3.37333C13.3258 4.1675 13.2391 4.96417 13.0708 5.72583L12.5974 7.49917H7.40495L6.93578 5.7425C6.76328 4.96667 6.67661 4.17 6.67161 3.3725C8.35578 3.57167 9.69245 4.86333 9.70661 4.8775C9.78828 4.95833 9.89495 4.99917 10.0016 4.99917L10.0008 5ZM18.0824 15.2517C16.5124 17.5575 13.1891 19.1667 10.0008 19.1667C6.81245 19.1667 3.48911 17.5567 1.91911 15.2517C1.49661 14.6317 1.61328 13.795 2.21245 13.2842L7.25495 8.33417H12.7483L17.8124 13.305C18.3891 13.7958 18.5058 14.6325 18.0833 15.2525L18.0824 15.2517Z"
          fill={color}
        />
      </G>
      <Defs>
        <ClipPath id="catalogClip">
          <Rect width={20} height={20} fill="white" />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

function TeamIcon({ focused }: { focused: boolean }) {
  const color = focused ? '#1A1A1A' : '#1A1A1A90';

  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <G clipPath="url(#teamClip)">
        <Path
          d="M11.6667 10C11.6667 11.8383 13.1617 13.3333 15 13.3333C16.8383 13.3333 18.3333 11.8383 18.3333 10C18.3333 8.16167 16.8383 6.66667 15 6.66667C13.1617 6.66667 11.6667 8.16167 11.6667 10ZM15 7.5C16.3783 7.5 17.5 8.62167 17.5 10C17.5 11.3783 16.3783 12.5 15 12.5C13.6217 12.5 12.5008 11.3783 12.5008 10C12.5008 8.62167 13.6217 7.5 15 7.5ZM10 6.66667C11.8383 6.66667 13.3333 5.17167 13.3333 3.33333C13.3333 1.495 11.8383 0 10 0C8.16167 0 6.66667 1.495 6.66667 3.33333C6.66667 5.17167 8.16167 6.66667 10 6.66667ZM10 0.833333C11.3783 0.833333 12.5 1.955 12.5 3.33333C12.5 4.71167 11.3783 5.83333 10 5.83333C8.62167 5.83333 7.5 4.71167 7.5 3.33333C7.5 1.955 8.62167 0.833333 10 0.833333ZM5 13.3333C6.83833 13.3333 8.33333 11.8383 8.33333 10C8.33333 8.16167 6.83833 6.66667 5 6.66667C3.16167 6.66667 1.66667 8.16167 1.66667 10C1.66667 11.8383 3.16167 13.3333 5 13.3333ZM5 7.5C6.37833 7.5 7.5 8.62167 7.5 10C7.5 11.3783 6.37833 12.5 5 12.5C3.62167 12.5 2.5 11.3783 2.5 10C2.5 8.62167 3.62167 7.5 5 7.5ZM20 19.375V19.5833C20 19.8133 19.8133 20 19.5833 20C19.3533 20 19.1667 19.8133 19.1667 19.5833V19.375C19.1667 17.9275 18.45 16.5758 17.2483 15.7592C17.0533 15.625 16.775 15.6767 16.6167 15.8742L15.6117 17.1308C15.2367 17.6 14.4508 17.6017 14.0742 17.1308L13.0325 15.8292C12.8775 15.635 12.6008 15.5817 12.405 15.7108C11.16 16.5225 10.4167 17.8925 10.4167 19.3758V19.5842C10.4167 19.8142 10.23 20.0008 10 20.0008C9.77 20.0008 9.58333 19.8142 9.58333 19.5842V19.3758C9.58333 17.9283 8.86583 16.5767 7.665 15.76C7.46833 15.6275 7.19167 15.6775 7.03333 15.875L6.02833 17.1317C5.84083 17.3658 5.56083 17.5008 5.26 17.5008C4.96 17.5008 4.68 17.3658 4.49167 17.1317L3.44917 15.8292C3.29417 15.635 3.01917 15.5825 2.82167 15.7108C1.57667 16.5225 0.833333 17.8925 0.833333 19.3758V19.5842C0.833333 19.8142 0.646667 20.0008 0.416667 20.0008C0.186667 20.0008 0 19.8133 0 19.5833V19.375C0 17.6092 0.885 15.9775 2.36667 15.0117C2.91917 14.6525 3.67917 14.7825 4.1 15.3075L5.14167 16.61C5.21917 16.7083 5.29833 16.7092 5.37667 16.61L6.38167 15.3533C6.81 14.8183 7.57917 14.6933 8.1325 15.07C8.97583 15.6433 9.61167 16.4417 9.9975 17.3508C10.395 16.4092 11.0617 15.59 11.9492 15.0117C12.5008 14.6525 13.2617 14.7817 13.6833 15.3075L14.725 16.61C14.805 16.7108 14.8833 16.7067 14.96 16.61L15.965 15.3533C16.3942 14.8192 17.1633 14.6942 17.7158 15.0692C19.1458 16.0417 20 17.6508 20 19.375Z"
          fill={color}
        />
      </G>
      <Defs>
        <ClipPath id="teamClip">
          <Rect width={20} height={20} fill="white" />
        </ClipPath>
      </Defs>
    </Svg>
  );
}

function ProfileIcon({ focused }: { focused: boolean }) {
  const color = focused ? '#1A1A1A' : '#1A1A1A90';

  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M8.95801 8.95703C10.3387 8.95703 11.458 7.83774 11.458 6.45703C11.458 5.07632 10.3387 3.95703 8.95801 3.95703C7.5773 3.95703 6.45801 5.07632 6.45801 6.45703C6.45801 7.83774 7.5773 8.95703 8.95801 8.95703Z"
        stroke={color}
        strokeWidth={1.25}
      />
      <Path
        d="M8.95833 17.2917C13.5607 17.2917 17.2917 13.5607 17.2917 8.95833C17.2917 4.35596 13.5607 0.625 8.95833 0.625C4.35596 0.625 0.625 4.35596 0.625 8.95833C0.625 13.5607 4.35596 17.2917 8.95833 17.2917Z"
        stroke={color}
        strokeWidth={1.25}
      />
      <Path
        d="M13.9334 15.6237C13.8001 13.2137 13.0626 11.457 8.9584 11.457C4.85423 11.457 4.11673 13.2137 3.9834 15.6237"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);
  // Advisors get a limited view: team management is owner-only, so the Team
  // tab is hidden for them (its endpoints would 403 anyway).
  const { user } = useAuthStore();
  const isAdvisor = user?.role === 'advisor';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1A1A1A',
        tabBarInactiveTintColor: '#1A1A1A90',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#F0F0F0',
          height: 68 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarItemStyle: {
          paddingTop: 4,
          paddingBottom: 0,
          justifyContent: 'center',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <HomeIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Dashboard" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ focused }) => <CalendarIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Calendar" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="catalog"
        options={{
          title: 'Catalog',
          tabBarIcon: ({ focused }) => <CatalogIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Catalog" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
          tabBarIcon: ({ focused }) => <TeamIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Team" focused={focused} />,
          // Hidden for advisors (team management is owner-only).
          href: isAdvisor ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <ProfileIcon focused={focused} />,
          tabBarLabel: ({ focused }) => <TabLabel label="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
