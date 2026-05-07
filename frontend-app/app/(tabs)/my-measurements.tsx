import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../shared/api/api';

type Step = 'form' | 'camera' | 'processing';

interface Measurements {
  height_cm: string;
  bust_cm: string;
  waist_cm: string;
  hips_cm: string;
  shoulder_cm: string;
  arm_length_cm: string;
}

const EMPTY: Measurements = {
  height_cm: '',
  bust_cm: '',
  waist_cm: '',
  hips_cm: '',
  shoulder_cm: '',
  arm_length_cm: '',
};

function fmt(v: number | null | undefined): string {
  if (v == null) return '';
  return String(Math.round(v * 10) / 10);
}

export default function MyMeasurementsScreen() {
  const router = useRouter();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);

  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source_, setSource_] = useState<string | null>(null);

  // Scan inputs
  const [weightKg, setWeightKg] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | ''>('');

  // Measurement fields
  const [m, setM] = useState<Measurements>(EMPTY);

  const setField = (key: keyof Measurements) => (val: string) =>
    setM((prev) => ({ ...prev, [key]: val }));

  const handleBack = useCallback(() => {
    if (step === 'camera') {
      setStep('form');
      return;
    }
    if (source === 'profile') {
      router.replace('/(tabs)/profile');
      return;
    }
    router.back();
  }, [step, source, router]);

  // Load existing measurements on mount
  useEffect(() => {
    api
      .get('/users/me/measurements')
      .then((data: any) => {
        setM({
          height_cm: fmt(data.height_cm),
          bust_cm: fmt(data.bust_cm),
          waist_cm: fmt(data.waist_cm),
          hips_cm: fmt(data.hips_cm),
          shoulder_cm: fmt(data.shoulder_cm),
          arm_length_cm: fmt(data.arm_length_cm),
        });
        if (data.weight_kg) setWeightKg(fmt(data.weight_kg));
        setSource_(data.measurements_source ?? null);
      })
      .catch(() => {});
  }, []);

  const handleStartScan = async () => {
    if (!m.height_cm.trim() || !weightKg.trim()) {
      Alert.alert('Required', 'Please enter your height and weight before scanning.');
      return;
    }
    if (!age.trim() || !gender) {
      Alert.alert('Required', 'Please enter your age and select your gender before scanning.');
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera access required', 'Please allow camera access in your device settings.');
        return;
      }
    }
    setStep('camera');
  };

  const handleCapture = async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.8 });
      if (!photo?.base64) throw new Error('Could not capture photo.');
      setStep('processing');

      const data: any = await api.post('/users/me/measurements/scan', {
        height_cm: parseFloat(m.height_cm),
        weight_kg: parseFloat(weightKg),
        age: parseInt(age, 10),
        gender,
        front_image_data_url: `data:image/jpeg;base64,${photo.base64}`,
      });

      setM({
        height_cm: fmt(data.height_cm) || m.height_cm,
        bust_cm: fmt(data.bust_cm),
        waist_cm: fmt(data.waist_cm),
        hips_cm: fmt(data.hips_cm),
        shoulder_cm: fmt(data.shoulder_cm),
        arm_length_cm: fmt(data.arm_length_cm),
      });
      if (data.weight_kg) setWeightKg(fmt(data.weight_kg));
      setSource_(data.measurements_source ?? 'bodygram');
      setStep('form');
      Alert.alert('Scan complete', 'Your measurements have been updated. Review and save below.');
    } catch (e: any) {
      setStep('camera');
      Alert.alert('Scan failed', e?.message || 'Could not process your photo. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const body: Record<string, number> = {};
    const pairs: [string, string][] = [
      ['height_cm', m.height_cm],
      ['bust_cm', m.bust_cm],
      ['waist_cm', m.waist_cm],
      ['hips_cm', m.hips_cm],
      ['shoulder_cm', m.shoulder_cm],
      ['arm_length_cm', m.arm_length_cm],
      ['weight_kg', weightKg],
    ];
    for (const [key, val] of pairs) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) body[key] = n;
    }
    if (Object.keys(body).length === 0) return;

    setSaving(true);
    try {
      await api.put('/users/me/measurements', body);
      setSource_('manual');
      Alert.alert('Saved', 'Your measurements have been saved.', [{ text: 'OK', onPress: handleBack }]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = Object.values(m).some((v) => v.trim().length > 0);

  const Label = ({ children }: { children: string }) => (
    <Text
      className="text-black/40 uppercase mb-2"
      style={{ fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 12, letterSpacing: 0.72 }}
    >
      {children}
    </Text>
  );

  const MeasurementInput = ({
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
        letterSpacing: 0.84,
        color: '#000',
      }}
      placeholderTextColor="#BDBDBD"
    />
  );

  // Camera step
  if (step === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

        <View style={{ position: 'absolute', top: insets.top + 10, left: 20 }}>
          <TouchableOpacity onPress={handleBack}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
        </View>

        <View
          style={{
            position: 'absolute',
            bottom: insets.bottom + 32,
            left: 0,
            right: 0,
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Text
            style={{
              color: 'white',
              fontFamily: 'Helvetica Neue',
              fontWeight: '300',
              fontSize: 13,
              letterSpacing: 0.5,
              textAlign: 'center',
              paddingHorizontal: 32,
              opacity: 0.85,
            }}
          >
            Stand straight, arms slightly out.{'\n'}Plain background works best.
          </Text>

          <TouchableOpacity
            onPress={handleCapture}
            disabled={loading}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: 'white',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 8,
            }}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#000' }} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Processing overlay
  if (step === 'processing') {
    return (
      <View style={{ flex: 1, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#000" />
        <Text
          style={{
            marginTop: 20,
            fontFamily: 'Helvetica Neue',
            fontWeight: '300',
            fontSize: 14,
            letterSpacing: 1,
            color: '#000',
            opacity: 0.6,
          }}
        >
          Analysing your measurements...
        </Text>
      </View>
    );
  }

  // Main form step
  return (
    <View className="flex-1 bg-white">
      <View className="px-6 flex-row items-center pb-4" style={{ paddingTop: insets.top + 10 }}>
        <TouchableOpacity onPress={handleBack} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
      >
        <View style={{ width: '100%', maxWidth: 390, alignSelf: 'center' }}>
          <Text
            className="text-black mb-4"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '200', fontSize: 16, letterSpacing: 2, textTransform: 'uppercase' }}
          >
            My Measurements
          </Text>

          <Text
            className="text-black mb-10"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 14, lineHeight: 24, opacity: 0.6 }}
          >
            Use AI Scan for automatic measurements, or enter them manually.
          </Text>

          {/* AI Scan section */}
          <Text
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#000', opacity: 0.35, marginBottom: 16 }}
          >
            AI Scan
          </Text>

          <View className="mb-6">
            <Label>Height (cm) *</Label>
            <MeasurementInput value={m.height_cm} onChangeText={setField('height_cm')} />
          </View>

          <View className="mb-6">
            <Label>Weight (kg) *</Label>
            <MeasurementInput value={weightKg} onChangeText={setWeightKg} />
          </View>

          <View className="mb-6">
            <Label>Age *</Label>
            <MeasurementInput value={age} onChangeText={setAge} />
          </View>

          <View className="mb-8">
            <Label>Gender *</Label>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              {(['female', 'male'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: gender === g ? '#000' : '#E0E0E0',
                    backgroundColor: gender === g ? '#000' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Helvetica Neue',
                      fontWeight: '300',
                      fontSize: 12,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      color: gender === g ? '#fff' : '#000',
                    }}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleStartScan}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#000',
              paddingVertical: 14,
              marginBottom: 36,
              gap: 8,
            }}
          >
            <Ionicons name="scan-outline" size={16} color="#000" />
            <Text style={{ fontFamily: 'Helvetica Neue', fontWeight: '400', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
              Scan with Camera
            </Text>
          </TouchableOpacity>

          {/* Manual measurements section */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Text
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '300', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#000', opacity: 0.35 }}
            >
              Measurements
            </Text>
            {source_ ? (
              <Text style={{ marginLeft: 8, fontSize: 10, color: source_ === 'bodygram' ? '#2E7D32' : '#999', fontFamily: 'Helvetica Neue', fontWeight: '300' }}>
                {source_ === 'bodygram' ? '● AI' : '● Manual'}
              </Text>
            ) : null}
          </View>

          <View className="mb-6">
            <Label>Bust (cm)</Label>
            <MeasurementInput value={m.bust_cm} onChangeText={setField('bust_cm')} />
          </View>

          <View className="mb-6">
            <Label>Waist (cm)</Label>
            <MeasurementInput value={m.waist_cm} onChangeText={setField('waist_cm')} />
          </View>

          <View className="mb-6">
            <Label>Hips (cm)</Label>
            <MeasurementInput value={m.hips_cm} onChangeText={setField('hips_cm')} />
          </View>

          <View className="mb-6">
            <Label>Shoulder (cm)</Label>
            <MeasurementInput value={m.shoulder_cm} onChangeText={setField('shoulder_cm')} />
          </View>

          <View className="mb-8">
            <Label>Arm Length (cm)</Label>
            <MeasurementInput value={m.arm_length_cm} onChangeText={setField('arm_length_cm')} />
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSave}
            disabled={saving || !canSave}
            className={`w-full py-4 items-center justify-center mt-6 mb-8 ${saving || !canSave ? 'bg-black/30' : 'bg-black'}`}
          >
            {saving ? (
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
