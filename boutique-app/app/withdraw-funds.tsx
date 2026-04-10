import React, { useState } from 'react';
import { View, Text, SafeAreaView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const BANK_OPTIONS = ['Commonwealth Bank ..4521', 'Westpac Bank ..2234', 'NAB Bank ..1010'] as const;

export default function WithdrawFundsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bankOpen, setBankOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<(typeof BANK_OPTIONS)[number]>('Commonwealth Bank ..4521');
  const [amount, setAmount] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-10">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>

        <Text className="text-[13px] uppercase tracking-[2px] text-black/70 mb-6">Withdraw Funds</Text>

        <View className="border border-[#1A1A1A] px-6 py-5 mb-6 items-center">
          <Text className="text-[12px] uppercase tracking-[1px] text-black/55 mb-2">Available Balance</Text>
          <Text
            className="text-[26px] text-black"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}
          >
            $1500.60
          </Text>
        </View>

        <View className="mb-5" style={{ zIndex: bankOpen ? 30 : 1 }}>
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Withdraw To *</Text>
          <View className="relative">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setBankOpen((current) => !current)}
              className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
            >
              <Text className="text-[12px] text-black/80">{selectedBank}</Text>
              <Ionicons name={bankOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#7A7A7A" />
            </TouchableOpacity>

            {bankOpen ? (
              <View
                className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                style={{
                  zIndex: 40,
                  elevation: 12,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                {BANK_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedBank(option);
                      setBankOpen(false);
                    }}
                    className="px-3 py-3 flex-row items-center"
                    style={{
                      borderBottomWidth: index === BANK_OPTIONS.length - 1 ? 0 : 1,
                      borderBottomColor: '#ECECEC',
                    }}
                  >
                    <View className="w-5">
                      {selectedBank === option ? <Ionicons name="checkmark" size={15} color="black" /> : null}
                    </View>
                    <Text className="text-[12px] text-black">{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <View className="mb-6">
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Enter Amount *</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
          />
        </View>

        <View className="border border-[#1A1A1A] px-6 py-5 mb-10">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[12px] text-black/55">Transfer Fee</Text>
            <Text className="text-[12px] text-black/55">$0.00</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text
              className="text-[12px] text-black"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Processing Time
            </Text>
            <Text
              className="text-[12px] text-black"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              1-2 business days
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.replace('/earning-wallet')}
          className="bg-black py-4 items-center justify-center mb-5"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-white">Confirm Withdrawal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.back()}
          className="border border-black py-4 items-center justify-center"
        >
          <Text className="text-[11px] uppercase tracking-[1px] text-black">Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
