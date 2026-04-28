import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MyMeasurementsScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  const [heightCm, setHeightCm] = useState('');
  const [bustCm, setBustCm] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [hipsCm, setHipsCm] = useState('');
  const [shoulderCm, setShoulderCm] = useState('');
  const [armLengthCm, setArmLengthCm] = useState('');

  const handleBack = () => {
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  };

  const canSave = useMemo(() => {
    return (
      heightCm.trim().length > 0 ||
      bustCm.trim().length > 0 ||
      waistCm.trim().length > 0 ||
      hipsCm.trim().length > 0 ||
      shoulderCm.trim().length > 0 ||
      armLengthCm.trim().length > 0
    );
  }, [heightCm, bustCm, waistCm, hipsCm, shoulderCm, armLengthCm]);

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    try {
      // UI-only for now; backend fields may vary.
      Alert.alert('Saved', 'Your measurements have been saved.', [{ text: 'OK', onPress: handleBack }]);
    } finally {
      setLoading(false);
    }
  };

  const Label = ({ children }: { children: string }) => (
    <Text
      className="text-black/40 uppercase mb-2"
      style={{
        fontFamily: 'Helvetica Neue',
        fontWeight: '300',
        fontSize: 12,
        lineHeight: 12,
        letterSpacing: 0.72, // 6%
      }}
    >
      {children}
    </Text>
  );

  const Input = ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (v: string) => void;
  }) => (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="numeric"
      style={{
        height: 28,
        width: '100%',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        paddingVertical: 0,
        fontFamily: 'Helvetica Neue',
        fontWeight: '300',
        fontSize: 14,
        lineHeight: 14,
        letterSpacing: 0.84, // 6%
        color: '#000',
      }}
      placeholderTextColor="#BDBDBD"
    />
  );

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={handleBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}
      >
        <View style={{ width: '100%', maxWidth: 390, alignSelf: 'center' }}>
          <Text
            className="text-black mb-4"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '200',
              fontSize: 16,
              lineHeight: 16,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            My Measurements
          </Text>

          <Text
            className="text-black mb-10"
            style={{
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 14,
              lineHeight: 24,
              letterSpacing: 0,
              opacity: 0.6,
            }}
          >
            Add your measurements to improve fit accuracy. You can update{'\n'}
            them any time from your account.
          </Text>

          <View className="mb-6">
            <Label>Height (cm)</Label>
            <Input value={heightCm} onChangeText={setHeightCm} />
          </View>

          <View className="mb-6">
            <Label>Bust (cm)</Label>
            <Input value={bustCm} onChangeText={setBustCm} />
          </View>

          <View className="mb-6">
            <Label>Waist (cm)</Label>
            <Input value={waistCm} onChangeText={setWaistCm} />
          </View>

          <View className="mb-6">
            <Label>Hips (cm)</Label>
            <Input value={hipsCm} onChangeText={setHipsCm} />
          </View>

          <View className="mb-6">
            <Label>Shoulder (cm)</Label>
            <Input value={shoulderCm} onChangeText={setShoulderCm} />
          </View>

          <View className="mb-8">
            <Label>Arm Length (cm)</Label>
            <Input value={armLengthCm} onChangeText={setArmLengthCm} />
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSave}
            disabled={loading || !canSave}
            className={`w-full py-4 items-center justify-center mt-10 mb-8 ${loading || !canSave ? 'bg-black/30' : 'bg-black'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white text-[12px] font-bold tracking-[2px] uppercase">Save</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

