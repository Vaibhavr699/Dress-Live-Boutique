import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';
// IMPORTANT: react-native-maps is native-only and will crash web bundling if imported at the top level.
// We lazy-require it only on iOS/Android.

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const DEFAULT_REGION: Region = {
  latitude: 52.52,
  longitude: 13.405,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View className="mb-5">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B9B9B9"
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`border-b border-[#ECECEC] text-[12px] text-black ${multiline ? 'min-h-[88px] pb-4' : 'pb-2'}`}
      />
    </View>
  );
}

function UploadBox({
  buttonLabel,
  onPress,
  variant = 'cover',
}: {
  buttonLabel: string;
  onPress: () => void;
  variant?: 'cover' | 'owner';
}) {
  const isOwner = variant === 'owner';

  if (isOwner) {
    // Owner: dashed square + separate button (no extra text)
    return (
      <View className="flex-row items-center">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          className="border border-[#1A1A1A] border-dashed items-center justify-center"
          style={{ width: 96, height: 78 }}
        >
          <Feather name="upload" size={18} color="#1A1A1A" />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          className="border border-[#1A1A1A] px-6 py-3 items-center justify-center ml-5"
        >
          <Text className="text-[10px] uppercase tracking-[0.7px] text-black">{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Cover: full-width row with inner dashed upload + dashed divider + button area
  return (
    <View className="h-[78px] flex-row items-stretch">
      <View className="w-[62%]">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          className="border border-[#1A1A1A] border-dashed items-center justify-center"
          style={{ margin: 8, height: 62 }}
        >
          <Feather name="upload" size={18} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      <View className="w-px h-full border-l border-[#1A1A1A] border-dashed" />

      <View className="flex-1 items-center justify-center">
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          className="border border-[#1A1A1A] px-6 py-3 items-center justify-center"
        >
          <Text className="text-[10px] uppercase tracking-[0.7px] text-black">{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function BusinessProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useAuthStore();

  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);
  const [ownerPhoto, setOwnerPhoto] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [pin, setPin] = useState<{ latitude: number; longitude: number }>(DEFAULT_REGION);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canUseNativeMaps = Platform.OS !== 'web';
  const Maps = useMemo(() => {
    if (!canUseNativeMaps) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('react-native-maps') as any;
    } catch {
      return null;
    }
  }, [canUseNativeMaps]);
  const MapViewComponent = (Maps?.default ?? Maps?.MapView) as any;
  const MarkerComponent = (Maps?.Marker ?? Maps?.MapMarker) as any;

  const reverseGeocodeToAddress = useCallback(async (latitude: number, longitude: number) => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude, longitude });
      const best = results?.[0];
      if (!best) return;
      const next = [
        best.name,
        best.street,
        best.city,
        best.region,
        best.postalCode,
        best.country,
      ]
        .filter(Boolean)
        .join(', ');
      if (next) setFullAddress(next);
    } catch {
      // ignore reverse geocode failures
    }
  }, []);

  const setFromCoords = useCallback(
    async (latitude: number, longitude: number) => {
      const nextRegion: Region = {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(nextRegion);
      setPin({ latitude, longitude });
      await reverseGeocodeToAddress(latitude, longitude);
    },
    [reverseGeocodeToAddress]
  );

  const useCurrentLocation = useCallback(async () => {
    if (!canUseNativeMaps) return;
    setLocationLoading(true);
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await setFromCoords(pos.coords.latitude, pos.coords.longitude);
    } catch (e) {
      setLocationError('Could not fetch current location.');
    } finally {
      setLocationLoading(false);
    }
  }, [canUseNativeMaps, setFromCoords]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (user?.boutique_id) {
          const boutique = await api.get(`/boutiques/${user.boutique_id}`);
          if (!alive) return;
          setShopName((boutique?.name as string) || '');
          setShopDescription((boutique?.description as string) || '');
          setFullAddress((boutique?.location as string) || '');
          setCoverPhoto((boutique?.header_image_url as string) || null);
        }
        if (!alive) return;
        setOwnerName(user?.full_name || '');
        setEmail(user?.email || '');
        setPhoneNumber(user?.phone || '');
        setOwnerPhoto(user?.profile_image_url || null);
        setFullAddress((prev) => prev || user?.address || '');
      } catch {
        // ignore bootstrap errors
      } finally {
        if (alive) setInitialLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.address, user?.boutique_id, user?.email, user?.full_name, user?.phone, user?.profile_image_url]);

  const pickImage = async (setter: (value: string | null) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  const uploadUserProfileImage = async (uri: string | null) => {
    if (!uri || /^https?:\/\//.test(uri)) return null;
    const form = new FormData();
    form.append('file', { uri, name: `owner-${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    const updatedUser = await api.postMultipart('/users/me/profile-image', form);
    setUser(updatedUser as any);
    return updatedUser as any;
  };

  const uploadBoutiqueCoverImage = async (uri: string | null) => {
    if (!uri || /^https?:\/\//.test(uri) || !user?.boutique_id) return null;
    const form = new FormData();
    form.append('file', { uri, name: `cover-${Date.now()}.jpg`, type: 'image/jpeg' } as any);
    const updatedBoutique = await api.postMultipart(`/boutiques/${user.boutique_id}/header-image`, form);
    return updatedBoutique as any;
  };

  const handleSave = async () => {
    if (saving) return;
    if (!user?.boutique_id) {
      setLocationError('Boutique missing for this account.');
      return;
    }
    setSaving(true);
    setLocationError(null);
    try {
      const [maybeBoutique, updatedUser] = await Promise.all([
        uploadBoutiqueCoverImage(coverPhoto),
        uploadUserProfileImage(ownerPhoto),
      ]);

      await api.put(`/boutiques/${user.boutique_id}`, {
        name: shopName.trim(),
        description: shopDescription.trim(),
        location: fullAddress.trim(),
        ...(maybeBoutique?.header_image_url ? { header_image_url: maybeBoutique.header_image_url } : {}),
      });

      const nextUser = await api.put('/users/me', {
        full_name: ownerName.trim(),
        email: email.trim(),
        phone: phoneNumber.trim(),
        address: fullAddress.trim(),
        ...(updatedUser?.profile_image_url ? { profile_image_url: updatedUser.profile_image_url } : {}),
      });
      setUser(nextUser as any);
      router.back();
    } catch (e: any) {
      setLocationError(e?.message || 'Could not save business profile changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 170 }}
        >
          <TouchableOpacity onPress={() => router.back()} className="mb-8 ml-1">
            <Ionicons name="arrow-back" size={18} color="black" />
          </TouchableOpacity>

          {initialLoading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color="#1A1A1A" />
              <Text className="text-[11px] text-black/45 mt-4">Loading details…</Text>
            </View>
          ) : (
            <>
          <Text
            className="text-[24px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Edit Business Details
          </Text>
          <Text className="text-[10px] text-black/45 leading-4 mb-6">
            Set up your boutique&apos;s and location details.
          </Text>

          <View className="border-t border-[#ECECEC] pt-5 mb-8">
            <Text
              className="text-[12px] uppercase tracking-[0.8px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Shop Information
            </Text>

            <Text className="text-[10px] text-black/45 mb-3">Upload Cover Photo *</Text>
            <View className="border border-[#1A1A1A]">
              <UploadBox
                buttonLabel="COVER PHOTO"
                onPress={() => pickImage(setCoverPhoto)}
                variant="cover"
              />
            </View>
            {coverPhoto ? (
              <View className="mt-3 border border-[#EAEAEA] overflow-hidden">
                <ImagePreview uri={coverPhoto} />
              </View>
            ) : null}

            <View className="mt-5">
              <LabeledInput label="Shop Name *" value={shopName} onChangeText={setShopName} />
              <LabeledInput
                label="Business Shop Description *"
                value={shopDescription}
                onChangeText={setShopDescription}
                multiline
                maxLength={500}
              />
              <View className="flex-row justify-between items-center -mt-3 mb-4">
                <Text className="text-[9px] text-black/35">This information will be visible to customers</Text>
                <Text className="text-[9px] text-black/35">{shopDescription.length}/500</Text>
              </View>
            </View>
          </View>

          <View className="mb-8">
            <Text
              className="text-[12px] text-black mb-1"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Shop Contact Info
            </Text>
            <Text className="text-[10px] text-black/45 leading-4 mb-5">
              Set up your boutique&apos;s and location details
            </Text>

            <Text
              className="text-[12px] uppercase tracking-[0.8px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Owner Personal Information
            </Text>

            <View className="mb-5">
              <UploadBox
                buttonLabel="UPLOAD IMAGE"
                onPress={() => pickImage(setOwnerPhoto)}
                variant="owner"
              />
            </View>
            {ownerPhoto ? (
              <View className="mb-5">
                <ImagePreview uri={ownerPhoto} square />
              </View>
            ) : null}

            <LabeledInput label="Owner Name *" value={ownerName} onChangeText={setOwnerName} />
            <LabeledInput
              label="Email *"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            <LabeledInput
              label="Primary Phone Number *"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <LabeledInput label="Full Address *" value={fullAddress} onChangeText={setFullAddress} />
          </View>

          <View className="mb-6">
            <Text
              className="text-[12px] text-black mb-4"
              style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
            >
              Change Pin Store Current Location
            </Text>

            <View className="h-[220px] border border-[#D8D8D8] bg-[#F3F3F3] overflow-hidden">
              {canUseNativeMaps && MapViewComponent && MarkerComponent ? (
                <MapViewComponent
                  style={{ width: '100%', height: '100%' }}
                  region={region}
                  onRegionChangeComplete={setRegion}
                >
                  <MarkerComponent
                    coordinate={pin}
                    draggable
                    onDragEnd={async (e: any) => {
                      const c = e.nativeEvent.coordinate;
                      setPin(c);
                      await reverseGeocodeToAddress(c.latitude, c.longitude);
                    }}
                  />
                </MapViewComponent>
              ) : (
                <View className="flex-1 items-center justify-center px-6">
                  <Text className="text-[11px] text-black/60 text-center">
                    Map is not available on web preview. Test on iOS/Android for full map + pin support.
                  </Text>
                </View>
              )}

              <View className="absolute right-3 bottom-3 bg-white px-4 py-2 rounded-full border border-[#E5E5E5] flex-row items-center">
                <Ionicons name="move-outline" size={14} color="#1A1A1A" />
                <Text className="text-[10px] text-black ml-1">Drag to adjust</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={useCurrentLocation}
              disabled={locationLoading || !canUseNativeMaps}
              className={`py-4 items-center justify-center mt-5 ${locationLoading || !canUseNativeMaps ? 'bg-black/30' : 'bg-black'}`}
            >
              {locationLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-[11px] uppercase tracking-[1px] text-white">Use Current Location</Text>
              )}
            </TouchableOpacity>

            {locationError ? (
              <Text className="text-[10px] text-[#C9491A] mt-3">{locationError}</Text>
            ) : null}

            <Text className="text-[10px] text-black/45 leading-4 mt-4">
              Your shop location helps customer find you easily in search results and on the map.
            </Text>
          </View>
            </>
          )}
        </ScrollView>

        <View
          className="px-5 flex-row bg-white border-t border-[#EFEFEF]"
          style={{ paddingBottom: insets.bottom + 16, paddingTop: 14 }}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            className="flex-1 border border-black py-4 items-center justify-center mr-1"
          >
            <Text className="text-[11px] uppercase tracking-[1px] text-black">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSave}
            disabled={saving || initialLoading}
            className="flex-1 bg-black py-4 items-center justify-center ml-1"
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-[11px] uppercase tracking-[1px] text-white">Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function ImagePreview({ uri, square = false }: { uri: string; square?: boolean }) {
  return (
    <Image
      source={{ uri }}
      style={{ width: square ? 96 : '100%', height: square ? 96 : 140 }}
      contentFit="cover"
    />
  );
}
