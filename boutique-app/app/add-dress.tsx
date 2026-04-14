import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';
import { useAuthStore } from '@shared/store/useAuthStore';

const STATUS_OPTIONS = ['Published', 'Private'] as const;
const CATEGORY_OPTIONS = ['Abendkleider', 'Hochzeitskleider', 'Add Ons'] as const;
const SERVICE_OPTIONS = ['AI TRY ON', 'LIVE TRY-ON', 'ADD TO CART', 'IN STORE VISIT'] as const;
const SIZE_OPTIONS = ['34', '36', '38', '40', '42', '44', '46', '48'] as const;
const COLOR_OPTIONS = ['White', 'Ivory', 'Champagne', 'Rose', 'Nude', 'Custom'] as const;

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View className="mb-4">
      <Text
        className="text-[12px] text-black"
        style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          className="text-[9px] text-black/35 mt-1 leading-4"
          style={{ fontFamily: 'Helvetica Neue' }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function LabeledInput({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View className="mb-4">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B9B9B9"
        keyboardType={keyboardType}
        className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
      />
    </View>
  );
}

function CheckTile({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className={`border border-[#D9D9D9] px-3 flex-row items-center ${
        compact ? 'py-2.5' : 'py-3'
      }`}
    >
      <View
        className={`w-4 h-4 border mr-2.5 items-center justify-center ${
          selected ? 'border-black' : 'border-[#BDBDBD]'
        }`}
      >
        {selected ? <View className="w-2 h-2 bg-black" /> : null}
      </View>
      <Text className="text-[10px] text-black/85 flex-1">{label}</Text>
    </TouchableOpacity>
  );
}

function UploadRow({
  label,
  hasFile,
  onPress,
}: {
  label: string;
  hasFile: boolean;
  onPress: () => void;
}) {
  return (
    <View className="mb-4">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <View className="border border-[#D9D9D9] px-3 py-3 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <View className="w-8 h-8 border border-[#D9D9D9] items-center justify-center mr-3">
            <Feather name="upload" size={14} color="#1A1A1A" />
          </View>
          <View className="flex-1">
            <Text className="text-[10px] text-black mb-1">Tap to Upload</Text>
            <Text className="text-[8px] text-black/45 leading-3">
              {hasFile ? 'File selected' : 'JPG, PNG or PDF (max 5MB)'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          className="bg-black px-4 py-2.5"
        >
          <Text className="text-[9px] uppercase tracking-[1px] text-white">Upload</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AddDressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [internalId, setInternalId] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number] | ''>('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['Abendkleider']);
  const [selectedServices, setSelectedServices] = useState<string[]>(['AI TRY ON']);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(['34', '36', '38']);
  const [customSizing, setCustomSizing] = useState(false);
  const [selectedColor, setSelectedColor] = useState('White');
  const [isVideoFittingAvailable, setIsVideoFittingAvailable] = useState(false);
  const [internalNotes, setInternalNotes] = useState('');

  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [videoAsset, setVideoAsset] = useState<string | null>(null);

  const pickAsset = async (setter: (uri: string | null) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  const toggleSelection = (
    value: string,
    selected: string[],
    setter: (next: string[]) => void
  ) => {
    setter(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  };

  const payloadDescription = useMemo(() => {
    return [
      description.trim(),
      internalId ? `Internal ID: ${internalId}` : '',
      status ? `Status: ${status}` : '',
      `Services: ${selectedServices.join(', ')}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }, [description, internalId, selectedServices, status]);

  const handleSave = async () => {
    if (!name.trim() || !price.trim()) {
      Alert.alert('Error', 'Please fill in dress name and final price.');
      return;
    }

    if (!user?.boutique_id) {
      Alert.alert('Boutique Missing', 'Your account is not linked to a boutique yet.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/dresses/', {
        name: name.trim(),
        description: payloadDescription,
        price: parseFloat(price),
        sizes: [
          ...selectedSizes,
          customSizing ? 'Custom Size According To The Customer Requirement' : '',
        ]
          .filter(Boolean)
          .join(', '),
        colors: selectedColor,
        image_url: frontImage || backImage || '',
        boutique_id: user.boutique_id,
        is_ai_enabled:
          selectedServices.includes('AI TRY ON') ||
          selectedServices.includes('LIVE TRY-ON'),
      });

      Alert.alert('Success', 'Dress added to catalog');
      router.push('/video-call-availability');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add dress');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <Ionicons name="arrow-back" size={18} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 36 }}
      >
        <View className="mb-6">
          <Text
            className="text-[30px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            Add New Dress
          </Text>
          <Text className="text-[10px] text-black/35 leading-4">
            Add pricing, materials, sizes & dress video assets.
          </Text>
        </View>

        <SectionHeader
          title="Basic Information"
          subtitle="Dress name, references id, and high-level info user across catalogs."
        />

        <LabeledInput
          label="Dress Name *"
          placeholder="Type here"
          value={name}
          onChangeText={setName}
        />

        <LabeledInput
          label="Dress Description"
          placeholder="Type here"
          value={description}
          onChangeText={setDescription}
        />

        <View className="flex-row gap-4 items-start mb-5">
          <View className="flex-1">
            <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
              Internal ID *
            </Text>
            <TextInput
              value={internalId}
              onChangeText={setInternalId}
              placeholder="SKU / reference"
              placeholderTextColor="#B9B9B9"
              className="border-b border-[#ECECEC] pb-2 text-[12px] text-black"
            />
          </View>
          <View
            className="flex-1"
            style={{ zIndex: statusDropdownOpen ? 50 : 1 }}
          >
            <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
              Product Status *
            </Text>
            <View className="relative">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setStatusDropdownOpen((current) => !current);
                  setColorDropdownOpen(false);
                }}
                className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
              >
                <Text className={`text-[12px] ${status ? 'text-black' : 'text-black/30'}`}>
                  {status || 'Select here'}
                </Text>
                <Ionicons
                  name={statusDropdownOpen ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color="#7A7A7A"
                />
              </TouchableOpacity>

              {statusDropdownOpen ? (
                <View
                  className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                  style={{
                    zIndex: 60,
                    elevation: 12,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 6 },
                  }}
                >
                  {STATUS_OPTIONS.map((option, index) => (
                    <TouchableOpacity
                      key={option}
                      activeOpacity={0.85}
                      onPress={() => {
                        setStatus(option);
                        setStatusDropdownOpen(false);
                      }}
                      className="px-3 py-3 flex-row items-center"
                      style={{
                        borderBottomWidth: index === STATUS_OPTIONS.length - 1 ? 0 : 1,
                        borderBottomColor: '#ECECEC',
                      }}
                    >
                      <View className="w-5">
                        {status === option ? (
                          <Ionicons name="checkmark" size={15} color="black" />
                        ) : null}
                      </View>
                      <Text className="text-[12px] text-black">{option}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <SectionHeader title="Choose Categories" />
        <View className="flex-row flex-wrap mb-6">
          {CATEGORY_OPTIONS.map((option, index) => (
            <View
              key={option}
              className="w-[48%] mb-3"
              style={{ marginRight: index % 2 === 0 ? '4%' : 0 }}
            >
              <CheckTile
                label={option}
                selected={selectedCategories.includes(option)}
                onPress={() =>
                  toggleSelection(option, selectedCategories, setSelectedCategories)
                }
              />
            </View>
          ))}
        </View>

        <SectionHeader title="Choose Options" subtitle="Service Options" />
        <View className="flex-row flex-wrap mb-6">
          {SERVICE_OPTIONS.map((option, index) => (
            <View
              key={option}
              className="w-[48%] mb-3"
              style={{ marginRight: index % 2 === 0 ? '4%' : 0 }}
            >
              <CheckTile
                label={option}
                selected={selectedServices.includes(option)}
                onPress={() =>
                  toggleSelection(option, selectedServices, setSelectedServices)
                }
              />
            </View>
          ))}
        </View>

        <SectionHeader
          title="Pricing & Sizes"
          subtitle="Price range and available sizes for appointments."
        />

        <LabeledInput
          label="Add Final Fix Price *"
          placeholder="Type here"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />

        <SectionHeader title="Available Sizes *" />
        <View className="flex-row flex-wrap mb-3">
          {SIZE_OPTIONS.map((option, index) => (
            <View
              key={option}
              className="w-[22%] mb-3"
              style={{ marginRight: index % 4 === 3 ? 0 : '4%' }}
            >
              <CheckTile
                label={option}
                selected={selectedSizes.includes(option)}
                onPress={() => toggleSelection(option, selectedSizes, setSelectedSizes)}
                compact
              />
            </View>
          ))}
        </View>

        <View className="mb-6">
          <CheckTile
            label="Custom Size According To The Customer Requirement"
            selected={customSizing}
            onPress={() => setCustomSizing((current) => !current)}
          />
        </View>

        <View
          className="mb-6"
          style={{ zIndex: colorDropdownOpen ? 40 : 1 }}
        >
          <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
            Choose Color *
          </Text>
          <View className="relative">
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setColorDropdownOpen((current) => !current);
                setStatusDropdownOpen(false);
              }}
              className="border-b border-[#ECECEC] pb-2 flex-row items-center justify-between"
            >
              <Text className="text-[12px] text-black">{selectedColor}</Text>
              <Ionicons
                name={colorDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="#7A7A7A"
              />
            </TouchableOpacity>

            {colorDropdownOpen ? (
              <View
                className="absolute left-0 right-0 top-full mt-2 border border-[#D9D9D9] bg-white"
                style={{
                  zIndex: 60,
                  elevation: 12,
                  shadowColor: '#000',
                  shadowOpacity: 0.08,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                {COLOR_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option}
                    activeOpacity={0.85}
                    onPress={() => {
                      setSelectedColor(option);
                      setColorDropdownOpen(false);
                    }}
                    className="px-3 py-3 flex-row items-center"
                    style={{
                      borderBottomWidth: index === COLOR_OPTIONS.length - 1 ? 0 : 1,
                      borderBottomColor: '#ECECEC',
                    }}
                  >
                    <View className="w-5">
                      {selectedColor === option ? (
                        <Ionicons name="checkmark" size={15} color="black" />
                      ) : null}
                    </View>
                    <Text className="text-[12px] text-black">{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <SectionHeader
          title="Media and AI Assets"
          subtitle="Photo, Video and 3D Assets for AI Try-On."
        />

        <UploadRow
          label="Upload Front Dress Image *"
          hasFile={!!frontImage}
          onPress={() => pickAsset(setFrontImage)}
        />
        <UploadRow
          label="Upload Back Dress Image *"
          hasFile={!!backImage}
          onPress={() => pickAsset(setBackImage)}
        />
        <UploadRow
          label="Upload AI Video Try For AI 3D Photo *"
          hasFile={!!videoAsset}
          onPress={() => pickAsset(setVideoAsset)}
        />

        <SectionHeader
          title="3D / AI Overlay Ready"
          subtitle="Upload a main photo to enable AI Try-On 3D asset & options for MVP."
        />

        <View className="border-t border-[#EFEFEF] pt-5 mt-2 mb-6">
          <SectionHeader
            title="Availability For Video Fitting"
            subtitle="Controls if the dress can be added to 4-dress shortlist."
          />
        </View>

        <View className="border-t border-[#EFEFEF] pt-5 mb-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-5">
              <Text
                className="text-[12px] text-black mb-1"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
              >
                Availability For Video Fitting
              </Text>
              <Text className="text-[10px] text-black/45 leading-5">
                Customers can only book if minimum 1 selected dresses are video-ready
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setIsVideoFittingAvailable((current) => !current)}
              className={`w-12 h-7 rounded-full px-1 justify-center ${
                isVideoFittingAvailable ? 'bg-black' : 'bg-[#E9E9E9]'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white ${
                  isVideoFittingAvailable ? 'self-end' : 'self-start'
                }`}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View className="border-t border-[#EFEFEF] pt-5 mb-2">
          <SectionHeader
            title="Internal Notes"
            subtitle="Only visible to advisors during calls."
          />
          <LabeledInput
            label="Fit & Alteration Notes *"
            placeholder="e.g., Romantic wedding lace mermaid dress with low back and lack details."
            value={internalNotes}
            onChangeText={setInternalNotes}
          />
        </View>

        <View className="flex-row mt-4 mb-10">
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.back()}
            className="flex-1 border border-[#1A1A1A] py-4 items-center justify-center mr-1"
          >
            <Text className="text-[11px] uppercase tracking-[1.3px] text-black">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleSave}
            disabled={loading}
            className="flex-1 bg-black py-4 items-center justify-center ml-1"
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-[11px] uppercase tracking-[1.1px] text-white">
                Save & Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

    </View>
  );
}
