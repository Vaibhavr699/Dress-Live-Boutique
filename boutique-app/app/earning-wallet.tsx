import React, { useMemo, useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const BANK_ACCOUNT = {
  name: 'Commonwealth Bank',
  details: 'BSB 062-000 • ....4521',
  status: 'Primary',
};

const TRANSACTIONS = [
  { id: '1', order: 'Order #1234', time: 'Today • 10:30 PM', amount: '+$250.50', status: 'Completed' },
  { id: '2', order: 'Order #1234', time: 'Today • 10:30 PM', amount: '+$250.50', status: 'Completed' },
  { id: '3', order: 'Order #1234', time: 'Today • 10:30 PM', amount: '+$250.50', status: 'Completed' },
];

type WalletTab = 'earnings' | 'withdrawals';

export default function EarningWalletScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<WalletTab>('earnings');

  const visibleTransactions = useMemo(
    () =>
      activeTab === 'earnings'
        ? TRANSACTIONS
        : TRANSACTIONS.map((item) => ({
            ...item,
            id: `${item.id}-w`,
            amount: '-$250.50',
          })),
    [activeTab]
  );

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

          <View className="border border-[#1A1A1A] px-6 py-5 mb-6">
            <Text className="text-[12px] uppercase tracking-[1px] text-black/55 mb-2">
              Available Balance
            </Text>
            <Text
              className="text-[26px] text-black"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}
            >
              $1500.60
            </Text>
          </View>

          <View className="flex-row mb-6">
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => router.push('/withdraw-funds')}
              className="flex-1 bg-black py-4 items-center justify-center mr-2"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-white">Withdraw</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/payment-methods')}
              className="flex-1 border border-black py-4 items-center justify-center ml-2"
            >
              <Text className="text-[11px] uppercase tracking-[1px] text-black">Add Bank</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row mb-6">
            <View className="flex-1 border border-[#1A1A1A] px-6 py-5 mr-2">
              <Text className="text-[12px] text-black/55 mb-2">Total Earning</Text>
              <Text
                className="text-[24px] text-black"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                $40K
              </Text>
            </View>
            <View className="flex-1 border border-[#1A1A1A] px-6 py-5 ml-2">
              <Text className="text-[12px] text-black/55 mb-2">This Week</Text>
              <Text
                className="text-[24px] text-black"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                $10K
              </Text>
            </View>
          </View>

          <View className="border border-[#D9D9D9] px-3 py-3 flex-row items-center mb-5">
            <View className="w-12 h-12 border border-[#1A1A1A] items-center justify-center mr-4">
              <Ionicons name="business-outline" size={22} color="#1A1A1A" />
            </View>
            <View className="flex-1">
              <Text
                className="text-[13px] text-black"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                {BANK_ACCOUNT.name}
              </Text>
              <Text className="text-[12px] text-black/50 mt-1">{BANK_ACCOUNT.details}</Text>
            </View>
            <View className="bg-black rounded-full px-4 py-1.5">
              <Text className="text-[10px] text-white">{BANK_ACCOUNT.status}</Text>
            </View>
          </View>

          <Text
            className="text-[16px] text-black mb-4"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Transactions
          </Text>

          <View className="flex-row items-center justify-center mb-4">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('earnings')}
              className="flex-1 items-center py-3 border-r border-[#E5E5E5]"
            >
              <Text className={`text-[12px] ${activeTab === 'earnings' ? 'text-black' : 'text-black/45'}`}>
                Earnings
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('withdrawals')}
              className="flex-1 items-center py-3"
            >
              <Text className={`text-[12px] ${activeTab === 'withdrawals' ? 'text-black' : 'text-black/45'}`}>
                Withdrawals
              </Text>
            </TouchableOpacity>
          </View>

          <View>
            {visibleTransactions.map((item) => (
              <View key={item.id} className="border border-[#1A1A1A] p-4 mb-4 flex-row items-center">
                <View className="w-12 h-12 bg-black items-center justify-center mr-4">
                  <Ionicons name="arrow-down-outline" size={18} color="white" />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-[13px] text-black"
                    style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
                  >
                    {item.order}
                  </Text>
                  <Text className="text-[12px] text-black/45 mt-1">{item.time}</Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-[13px] text-black mb-3"
                    style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}
                  >
                    {item.amount}
                  </Text>
                  <View className="bg-black rounded-full px-4 py-1.5">
                    <Text className="text-[10px] text-white">{item.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
