import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';
import { ensureMediaPermission } from '@shared/permissions/media';
import { useAuthStore } from '@shared/store/useAuthStore';
import { FigmaSuccessModal } from '../components/FigmaSuccessModal';
import { AITryOnSetup } from '../components/AITryOnSetup';
import { markCatalogDirty } from '../store/catalogSignal';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';

const STATUS_OPTIONS = ['Published', 'Private'] as const;
const CATEGORY_OPTIONS = ['Abendkleider', 'Hochzeitskleider', 'Add Ons'] as const;
const SERVICE_OPTIONS = ['AI TRY ON', 'LIVE TRY-ON', 'ADD TO CART', 'IN STORE VISIT'] as const;
const SIZE_OPTIONS = ['34', '36', '38', '40', '42', '44', '46', '48'] as const;
const COLOR_OPTIONS = ['White', 'Ivory', 'Champagne', 'Rose', 'Nude', 'Custom'] as const;

// When editing, the stored `description` packs human text plus metadata lines
// (Internal ID / Status / Services). Split them back out so the form shows a
// clean description and the right chips — and re-packs cleanly on save.
function parseStoredDescription(raw: string | null | undefined): {
  description: string;
  internalId: string;
  status: '' | 'Published' | 'Private';
  services: string[];
} {
  const parts = (raw ?? '').split('\n\n');
  let description = '';
  let internalId = '';
  let status: '' | 'Published' | 'Private' = '';
  let services: string[] = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    if (p.startsWith('Internal ID:')) internalId = p.slice('Internal ID:'.length).trim();
    else if (p.startsWith('Status:')) {
      const v = p.slice('Status:'.length).trim();
      if (v === 'Published' || v === 'Private') status = v;
    } else if (p.startsWith('Services:')) {
      services = p.slice('Services:'.length).split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      description = description ? `${description}\n\n${p}` : p;
    }
  }
  return { description, internalId, status, services };
}

// `sizes` is stored as a comma-joined string that may include the custom-size
// sentence. Split it back into the size chips + the custom toggle.
function splitStoredSizes(raw: string | null | undefined): { sizes: string[]; custom: boolean } {
  const parts = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const custom = parts.some((p) => p.toLowerCase().includes('custom size'));
  const sizes = parts.filter((p) => (SIZE_OPTIONS as readonly string[]).includes(p));
  return { sizes, custom };
}

type AddDressDraft = {
  name: string;
  description: string;
  internalId: string;
  price: string;
  status: (typeof STATUS_OPTIONS)[number] | '';
  selectedCategories: string[];
  selectedServices: string[];
  selectedSizes: string[];
  customSizing: boolean;
  selectedColor: string;
  isVideoFittingAvailable: boolean;
  internalNotes: string;
  frontImage: string | null;
  backImage: string | null;
  aiGarmentImage: string | null;
  videoAsset: string | null;
};

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
  errorText,
  multiline,
  numberOfLines,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: 'default' | 'numeric';
  errorText?: string | null;
  multiline?: boolean;
  numberOfLines?: number;
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
        multiline={multiline}
        numberOfLines={numberOfLines}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`border-b border-[#ECECEC] text-[12px] text-black ${
          multiline ? 'py-3 leading-[18px] min-h-[72px]' : 'pb-2'
        }`}
      />
      {errorText ? <Text className="text-[10px] text-[#C9491A] mt-2">{errorText}</Text> : null}
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
  previewUri,
  onPress,
}: {
  label: string;
  hasFile: boolean;
  previewUri?: string | null;
  onPress: () => void;
}) {
  return (
    <View className="mb-4">
      <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">{label}</Text>
      <View className="border border-[#D9D9D9] px-3 py-3 flex-row items-center justify-between">
        <View className="flex-row items-center flex-1 pr-3">
          <View className="w-10 h-10 border border-[#D9D9D9] items-center justify-center mr-3 overflow-hidden">
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Feather name="upload" size={14} color="#1A1A1A" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-[10px] text-black mb-1">{hasFile ? 'Selected' : 'Tap to Upload'}</Text>
            <Text className="text-[8px] text-black/45 leading-3">
              {hasFile ? 'Preview ready' : 'JPG, PNG or PDF (max 5MB)'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onPress}
          className="bg-black px-4 py-2.5"
        >
          <Text className="text-[9px] uppercase tracking-[1px] text-white">{hasFile ? 'Change' : 'Upload'}</Text>
        </TouchableOpacity>
      </View>

      {previewUri ? (
        <View className="mt-3 border border-[#EAEAEA]">
          <Image source={{ uri: previewUri }} style={{ width: '100%', height: 180 }} contentFit="cover" />
        </View>
      ) : null}
    </View>
  );
}

export default function AddDressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  // When an `id` is passed we're editing an existing dress, not adding one.
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = params.id ? String(params.id) : null;
  const isEditing = !!editId;
  const [editReady, setEditReady] = useState(!editId);

  const [loading, setLoading] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  // AI Try-On setup wizard — opened after save when AI Try-On is enabled, so
  // the partner can upload the 4 angles + standardize the garment image.
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  // True when the wizard was opened as part of the save flow (→ go to catalog on
  // close); false when opened from the in-form "Set up AI Try-On" button (→ just
  // return to the form).
  const [aiSetupFromSave, setAiSetupFromSave] = useState(false);
  const [savedDressId, setSavedDressId] = useState<number | null>(editId ? Number(editId) : null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [aiGarmentImage, setAiGarmentImage] = useState<string | null>(null);
  const [videoAsset, setVideoAsset] = useState<string | null>(null);

  const draftKey = useMemo(() => {
    const boutiqueId = user?.boutique_id ?? 'unknown';
    const userId = user?.id ?? 'unknown';
    return `add-dress-draft:${userId}:${boutiqueId}`;
  }, [user?.boutique_id, user?.id]);

  const draftValue: AddDressDraft = useMemo(
    () => ({
      name,
      description,
      internalId,
      price,
      status,
      selectedCategories,
      selectedServices,
      selectedSizes,
      customSizing,
      selectedColor,
      isVideoFittingAvailable,
      internalNotes,
      frontImage,
      backImage,
      aiGarmentImage,
      videoAsset,
    }),
    [
      name,
      description,
      internalId,
      price,
      status,
      selectedCategories,
      selectedServices,
      selectedSizes,
      customSizing,
      selectedColor,
      isVideoFittingAvailable,
      internalNotes,
      frontImage,
      backImage,
      aiGarmentImage,
      videoAsset,
    ]
  );

  // Load an existing dress into the form when editing. Skips the add-draft
  // restore below so a half-finished "new dress" draft never leaks into an edit.
  useEffect(() => {
    if (!editId) return;
    let active = true;
    (async () => {
      try {
        const d = (await api.get(`/dresses/${editId}`)) as {
          name?: string;
          description?: string | null;
          price?: number | null;
          sizes?: string | null;
          colors?: string | null;
          category?: string | null;
          image_url?: string | null;
          ai_model_url?: string | null;
          is_ai_enabled?: boolean | null;
        };
        if (!active) return;
        const meta = parseStoredDescription(d?.description);
        const sizeInfo = splitStoredSizes(d?.sizes);
        setName(d?.name ?? '');
        setPrice(d?.price != null ? String(d.price) : '');
        setDescription(meta.description);
        setInternalId(meta.internalId);
        if (meta.status) setStatus(meta.status);
        if (sizeInfo.sizes.length) setSelectedSizes(sizeInfo.sizes);
        setCustomSizing(sizeInfo.custom);
        if (d?.colors) setSelectedColor(d.colors);
        if (d?.category) {
          const cats = d.category
            .split(',')
            .map((c) => c.trim())
            .filter((c) => (CATEGORY_OPTIONS as readonly string[]).includes(c));
          if (cats.length) setSelectedCategories(cats);
        }
        setFrontImage(d?.image_url ?? null);
        setAiGarmentImage(d?.ai_model_url ?? null);
        let services = meta.services.filter((s) => (SERVICE_OPTIONS as readonly string[]).includes(s));
        if (d?.is_ai_enabled && !services.includes('AI TRY ON')) services = [...services, 'AI TRY ON'];
        if (services.length) setSelectedServices(services);
        else if (!d?.is_ai_enabled) setSelectedServices([]);
      } catch (e: any) {
        Alert.alert('Could not load dress', e?.message ?? 'Please try again.');
      } finally {
        if (active) setEditReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [editId]);

  useEffect(() => {
    if (isEditing) {
      // Editing never uses the saved add-draft.
      setDraftLoaded(true);
      return;
    }
    let isActive = true;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(draftKey);
        if (!saved || !isActive) {
          setDraftLoaded(true);
          return;
        }
        const parsed = JSON.parse(saved) as Partial<AddDressDraft>;
        if (!isActive) return;

        if (typeof parsed.name === 'string') setName(parsed.name);
        if (typeof parsed.description === 'string') setDescription(parsed.description);
        if (typeof parsed.internalId === 'string') setInternalId(parsed.internalId);
        if (typeof parsed.price === 'string') setPrice(parsed.price);
        if (parsed.status === '' || STATUS_OPTIONS.includes(parsed.status as any)) setStatus((parsed.status as any) ?? '');
        if (Array.isArray(parsed.selectedCategories)) setSelectedCategories(parsed.selectedCategories.filter(Boolean));
        if (Array.isArray(parsed.selectedServices)) setSelectedServices(parsed.selectedServices.filter(Boolean));
        if (Array.isArray(parsed.selectedSizes)) setSelectedSizes(parsed.selectedSizes.filter(Boolean));
        if (typeof parsed.customSizing === 'boolean') setCustomSizing(parsed.customSizing);
        if (typeof parsed.selectedColor === 'string') setSelectedColor(parsed.selectedColor);
        if (typeof parsed.isVideoFittingAvailable === 'boolean') setIsVideoFittingAvailable(parsed.isVideoFittingAvailable);
        if (typeof parsed.internalNotes === 'string') setInternalNotes(parsed.internalNotes);
        if (typeof parsed.frontImage === 'string' || parsed.frontImage === null) setFrontImage(parsed.frontImage ?? null);
        if (typeof parsed.backImage === 'string' || parsed.backImage === null) setBackImage(parsed.backImage ?? null);
        if (typeof parsed.aiGarmentImage === 'string' || parsed.aiGarmentImage === null) setAiGarmentImage(parsed.aiGarmentImage ?? null);
        if (typeof parsed.videoAsset === 'string' || parsed.videoAsset === null) setVideoAsset(parsed.videoAsset ?? null);
      } catch {
        // ignore draft restore errors
      } finally {
        if (isActive) setDraftLoaded(true);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [draftKey, isEditing]);

  const persistDraft = useCallback(async (payload: AddDressDraft) => {
    try {
      await SecureStore.setItemAsync(draftKey, JSON.stringify(payload));
    } catch {
      // ignore draft save errors
    }
  }, [draftKey]);

  const clearDraft = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(draftKey);
    } catch {
      // ignore
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded || isEditing) return; // don't autosave the add-draft while editing
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      persistDraft(draftValue);
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [draftLoaded, draftValue, persistDraft, isEditing]);

  const pickAsset = async (setter: (uri: string | null) => void) => {
    if (!(await ensureMediaPermission('library'))) return;
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

  const ensureRemoteImageUrl = async (
    uri: string | null,
    endpoint: '/dresses/upload-image' | '/dresses/upload-ai-image' = '/dresses/upload-image'
  ) => {
    if (!uri) return null;
    const trimmed = uri.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//.test(trimmed)) return trimmed;

    const form = new FormData();
    form.append(
      'file',
      {
        uri: trimmed,
        name: `dress-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any
    );
    const res = (await api.postMultipart(endpoint, form)) as { url?: string };
    return typeof res?.url === 'string' ? res.url : null;
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

  const nameError = useMemo(() => (name.trim().length === 0 ? 'Dress name is required.' : null), [name]);
  const priceError = useMemo(() => {
    if (price.trim().length === 0) return 'Price is required.';
    const numeric = Number(price);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'Enter a valid price.';
    return null;
  }, [price]);
  const mediaError = useMemo(
    () => (frontImage || backImage ? null : 'Add at least one dress image (front or back).'),
    [frontImage, backImage]
  );

  const formErrors = useMemo(
    () =>
      [
        nameError,
        priceError,
        selectedSizes.length === 0 ? 'Select at least 1 size.' : null,
        mediaError,
      ].filter(Boolean) as string[],
    [mediaError, nameError, priceError, selectedSizes.length]
  );

  const aiServicesSelected = useMemo(
    () => selectedServices.includes('AI TRY ON') || selectedServices.includes('LIVE TRY-ON'),
    [selectedServices]
  );

  // The "Enable AI Try-On" checkbox is a clearer, spec-named entry point that
  // drives the same `AI TRY ON` service (single source of truth, so the service
  // chip + all aiServicesSelected logic stay in sync). Toggling it on opens the
  // multi-angle setup wizard; off removes the service.
  const aiTryOnEnabled = useMemo(() => selectedServices.includes('AI TRY ON'), [selectedServices]);
  const toggleAiTryOn = useCallback(() => {
    setSelectedServices((prev) => {
      const on = prev.includes('AI TRY ON');
      return on ? prev.filter((s) => s !== 'AI TRY ON') : [...prev, 'AI TRY ON'];
    });
  }, []);

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
      const aiRequested = aiServicesSelected;

      const uploadedUrl = await ensureRemoteImageUrl(frontImage || backImage);
      if (!uploadedUrl) {
        Alert.alert('Image upload', 'Could not upload dress image. Please try again.');
        return;
      }

      const uploadedAiGarmentUrl = aiRequested
        ? await ensureRemoteImageUrl(aiGarmentImage, '/dresses/upload-ai-image')
        : null;

      const payload = {
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
        // Comma-separated like sizes/colors. Drives the buyer Home category
        // chips (Abendkleider / Hochzeitskleider / Add Ons).
        category: selectedCategories.filter(Boolean).join(', '),
        image_url: uploadedUrl,
        ai_model_url: aiRequested ? uploadedAiGarmentUrl || uploadedUrl : null,
        boutique_id: user.boutique_id,
        is_ai_enabled: aiRequested,
      };

      let dressId: number | null = isEditing ? Number(editId) : null;
      if (isEditing) {
        await api.put(`/dresses/${editId}`, payload);
      } else {
        const created = (await api.post('/dresses/', payload)) as { id?: number };
        dressId = created?.id ?? null;
        await clearDraft();
      }
      setSavedDressId(dressId);
      // Force the catalog/dashboard to refresh on next focus so the change is
      // immediately visible even within their staleness window.
      markCatalogDirty();
      // When AI Try-On is enabled, open the standardization wizard instead of
      // the plain success modal so the partner can upload the angle photos and
      // generate the standardized garment image right away.
      if (aiRequested && dressId) {
        setAiSetupFromSave(true);
        setAiSetupOpen(true);
      } else {
        setSuccessOpen(true);
      }
    } catch (error: any) {
      // 402 = require_active_subscription guard on the backend fired.
      // Don't show a generic "Error" — give the partner a one-tap path
      // to subscribe, AND keep their draft so they don't lose the form
      // they just filled out.
      if (error?.status === 402) {
        Alert.alert(
          'Subscription required',
          'You need an active Dress Live Partner subscription to publish dresses. Your draft is saved — subscribe now to finish?',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Subscribe',
              onPress: () => router.push('/subscribe' as any),
            },
          ],
        );
        return;
      }
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

      {isEditing && !editReady ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1A1A1A" />
        </View>
      ) : (
      <ScrollView
        className="flex-1 px-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        <View className="mb-6">
          <Text
            className="text-[30px] text-black mb-1"
            style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}
          >
            {isEditing ? 'Edit Dress' : 'Add New Dress'}
          </Text>
          <Text className="text-[10px] text-black/35 leading-4">
            {isEditing
              ? 'Update pricing, materials, sizes & dress assets.'
              : 'Add pricing, materials, sizes & dress video assets.'}
          </Text>
        </View>
            <SectionHeader
              title="Basic Information"
              subtitle="Dress name, reference ID, and the core details shown across your catalog."
            />

            <LabeledInput
              label="Dress Name *"
              placeholder="e.g. Elegant Satin A-Line"
              value={name}
              onChangeText={setName}
              errorText={nameError}
            />

            <LabeledInput
              label="Dress Description"
              placeholder="Fabric, neckline, silhouette, train, fit…"
              value={description}
              onChangeText={setDescription}
            />

            <View className="flex-row gap-4 items-start mb-5">
              <View className="flex-1">
                <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
                  Internal ID
                </Text>
                <TextInput
                  value={internalId}
                  onChangeText={setInternalId}
                  placeholder="SKU / reference"
                  placeholderTextColor="#B9B9B9"
                  className="border-b border-[#ECECEC] py-2 min-h-[40px] text-[12px] text-black"
                />
              </View>
              <View className="flex-1" style={{ zIndex: statusDropdownOpen ? 50 : 1 }}>
                <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">
                  Product Status
                </Text>
                <View className="relative">
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setStatusDropdownOpen((current) => !current);
                      setColorDropdownOpen(false);
                    }}
                    className="border-b border-[#ECECEC] py-2 min-h-[40px] flex-row items-center justify-between"
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
                            {status === option ? <Ionicons name="checkmark" size={15} color="black" /> : null}
                          </View>
                          <Text className="text-[12px] text-black">{option}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <SectionHeader
              title="Choose Categories"
              subtitle="Where this dress appears in your catalog."
            />
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
                    onPress={() => toggleSelection(option, selectedCategories, setSelectedCategories)}
                  />
                </View>
              ))}
            </View>

            <SectionHeader
              title="Choose Options"
              subtitle="What customers can do with this dress — AI try-on, live try-on, add to cart, in-store visit."
            />
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
                    onPress={() => toggleSelection(option, selectedServices, setSelectedServices)}
                  />
                </View>
              ))}
            </View>

            {/* Enable AI Try-On — dedicated checkbox (spec entry point). Drives
                the same `AI TRY ON` service so it stays in sync with the chip
                above. When on, the multi-angle setup wizard becomes available. */}
            <View className="border border-[#D9D9D9] p-4 mb-6">
              <CheckTile
                label="Enable AI Try-On"
                selected={aiTryOnEnabled}
                onPress={toggleAiTryOn}
              />
              {aiTryOnEnabled ? (
                <View className="mt-3">
                  <Text className="text-[11px] text-black mb-1" style={{ fontWeight: '600' }}>
                    Improve AI Try-On Quality
                  </Text>
                  <Text className="text-[9px] text-black/45 leading-4 mb-3">
                    For the sharpest results, add 4 angle photos — front, back, left, right — in the multi-angle setup that opens after you save.
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      if (!savedDressId) {
                        Alert.alert(
                          'Save first',
                          'Save the dress, then the multi-angle AI Try-On setup will open automatically.',
                        );
                        return;
                      }
                      setAiSetupFromSave(false);
                      setAiSetupOpen(true);
                    }}
                    className="border border-black px-4 py-2.5 self-start"
                  >
                    <Text className="text-[10px] uppercase tracking-[1px] text-black">
                      {savedDressId ? 'Open multi-angle setup' : 'Set up after saving'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <SectionHeader
              title="Pricing & Sizes"
              subtitle="Price range and available sizes for appointments."
            />

            <LabeledInput
              label="Final Price (€) *"
              placeholder="e.g. 1800"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              errorText={priceError}
            />

            <SectionHeader title="Available Sizes *" />
            {selectedSizes.length === 0 ? (
              <Text className="text-[10px] text-[#C9491A] mb-3">Select at least 1 size.</Text>
            ) : null}
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

            {mediaError ? <Text className="text-[10px] text-[#C9491A] mb-3">{mediaError}</Text> : null}

            <UploadRow
              label="Upload Front Dress Image *"
              hasFile={!!frontImage}
              previewUri={frontImage}
              onPress={() => pickAsset(setFrontImage)}
            />
            <UploadRow
              label="Upload Back Dress Image *"
              hasFile={!!backImage}
              previewUri={backImage}
              onPress={() => pickAsset(setBackImage)}
            />

            {/* Multi-angle AI Try-On setup — only meaningful once the dress
                exists (needs an id to attach angle photos + run standardization).
                Lets a partner editing an AI dress re-open the wizard to add
                angles or regenerate the standardized image. */}
            {aiServicesSelected && savedDressId ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setAiSetupFromSave(false);
                  setAiSetupOpen(true);
                }}
                className="border border-black px-4 py-3 mb-4 flex-row items-center justify-between"
              >
                <View className="flex-1 pr-3">
                  <Text className="text-[11px] text-black" style={{ fontWeight: '600' }}>
                    Set up AI Try-On (multi-angle)
                  </Text>
                  <Text className="text-[9px] text-black/45 mt-1 leading-4">
                    Upload Front / Back / Left / Right + swatch and generate the standardized studio image.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#1A1A1A" />
              </TouchableOpacity>
            ) : null}

            {/* AI Garment Image — shown always, more prominent when AI is selected */}
            <View className={`mb-2 ${aiServicesSelected ? 'border border-black/10 p-4 rounded-sm' : ''}`}>
              {aiServicesSelected && (
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-[10px] font-bold uppercase tracking-[0.8px] text-black">
                    AI Garment Image
                  </Text>
                  {aiGarmentImage ? (
                    <View className="flex-row items-center bg-[#EEF8EE] px-2 py-1 rounded-full">
                      <View className="w-1.5 h-1.5 rounded-full bg-[#4EA35D] mr-1.5" />
                      <Text className="text-[#4EA35D] text-[8px] uppercase tracking-[0.6px]">AI Ready</Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center bg-[#FFF4EC] px-2 py-1 rounded-full">
                      <View className="w-1.5 h-1.5 rounded-full bg-[#C9491A] mr-1.5" />
                      <Text className="text-[#C9491A] text-[8px] uppercase tracking-[0.6px]">Using Fallback</Text>
                    </View>
                  )}
                </View>
              )}

              <UploadRow
                label={aiServicesSelected ? '' : 'Upload AI Garment Image'}
                hasFile={!!aiGarmentImage}
                previewUri={aiGarmentImage}
                onPress={() => pickAsset(setAiGarmentImage)}
              />

              {/* Guidance — more detailed when AI is selected */}
              {aiServicesSelected ? (
                <View className="bg-[#F9F9F9] p-4 rounded-sm mb-2">
                  <Text className="text-[10px] font-bold uppercase tracking-[0.6px] text-black/50 mb-3">
                    What to upload
                  </Text>
                  {[
                    ['✓', 'Dress photographed flat or on a hanger'],
                    ['✓', 'Plain white or transparent background'],
                    ['✓', 'Full dress visible — top to hem'],
                    ['✗', 'No model wearing the dress'],
                    ['✗', 'No busy or cluttered backgrounds'],
                  ].map(([icon, tip], i) => (
                    <View key={i} className="flex-row items-start mb-1.5">
                      <Text className={`text-[10px] mr-2 ${icon === '✓' ? 'text-[#4EA35D]' : 'text-[#C9491A]'}`}>
                        {icon}
                      </Text>
                      <Text className="text-[10px] text-black/60 flex-1 leading-4">{tip}</Text>
                    </View>
                  ))}
                  {!aiGarmentImage && (
                    <View className="mt-3 pt-3 border-t border-[#ECECEC]">
                      <Text className="text-[10px] text-[#C9491A] leading-4">
                        No AI garment image uploaded. The main dress photo will be used as fallback — this may reduce try-on accuracy.
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text className="text-[10px] text-black/45 leading-5 mb-4">
                  Required when AI Try-On or Live Try-On is enabled. Upload a clean front-facing dress photo on a white or transparent background — no model.
                </Text>
              )}
            </View>

            <UploadRow
              label="Upload Video Asset for AI 3D Photo *"
              hasFile={!!videoAsset}
              previewUri={videoAsset}
              onPress={() => pickAsset(setVideoAsset)}
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
                    Customers can only book a video fitting if at least 1 of their selected dresses is video-ready.
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
                label="Fit & Alteration Notes"
                placeholder="e.g. Runs small — size up; bustle adds ~20 min; sample is ivory."
                value={internalNotes}
                onChangeText={setInternalNotes}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleSave}
              disabled={loading || formErrors.length > 0}
              className={`w-full py-4 items-center justify-center mt-6 ${
                loading || formErrors.length > 0 ? 'bg-black/30' : 'bg-black'
              }`}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-[11px] uppercase tracking-[1.1px] text-white">
                  {isEditing ? 'Update' : 'Save'}
                </Text>
              )}
            </TouchableOpacity>
      </ScrollView>
      )}

      <FigmaSuccessModal
        visible={successOpen}
        onClose={() => setSuccessOpen(false)}
        title={isEditing ? 'Dress Updated Successfully' : 'Dress Added Successfully'}
        description={
          isEditing
            ? 'Your changes have been saved and the catalog has been updated.'
            : 'Your new dress listing is now added to your catalog and will be visible based on your shop visibility settings.'
        }
        buttonText="GO TO CATALOG"
        onButtonPress={() => {
          setSuccessOpen(false);
          router.replace('/(tabs)/catalog');
        }}
      />

      <AITryOnSetup
        visible={aiSetupOpen}
        dressId={savedDressId}
        onClose={() => {
          setAiSetupOpen(false);
          // From the save flow, finishing the wizard returns to the catalog.
          // From the in-form button, just return to the form being edited.
          if (aiSetupFromSave) router.replace('/(tabs)/catalog');
        }}
        onApproved={() => {
          markCatalogDirty();
        }}
      />
    </View>
  );
}
