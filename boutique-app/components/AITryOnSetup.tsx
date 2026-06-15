import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';
import { ensureMediaPermission } from '@shared/permissions/media';

/**
 * AI Try-On setup wizard for a single dress.
 *
 * Shown when "AI TRY ON" is enabled. Boutique uploads the 4 required angles
 * (+ optional detail shots + colour swatch), the backend standardizes them into
 * a studio product image (FLUX Kontext, async), and the boutique reviews it:
 * Accept / Regenerate / Upload manually.
 *
 * Requires the dress to already exist (so we have an id to attach images and
 * jobs to). add-dress saves the dress first, then opens this.
 */

type Role = 'front' | 'back' | 'left' | 'right' | 'detail' | 'swatch' | 'standardized';

type DressImage = { id: number; role: Role; url: string; position: number };

type AIJob = {
  id: number;
  status: 'pending' | 'submitted' | 'completed' | 'failed' | 'canceled';
  result?: { images?: { url: string }[]; output?: string } | null;
  error?: string | null;
};

const REQUIRED: { role: Role; label: string }[] = [
  { role: 'front', label: 'Front' },
  { role: 'back', label: 'Back' },
  { role: 'left', label: 'Left' },
  { role: 'right', label: 'Right' },
];

function completenessLabel(count: number): { pct: number; label: string; color: string } {
  const pct = Math.round((count / REQUIRED.length) * 100);
  if (count >= 4) return { pct, label: 'Excellent', color: '#4EA35D' };
  if (count >= 2) return { pct, label: 'Good', color: '#C99A1A' };
  return { pct, label: 'Poor', color: '#C9491A' };
}

function firstResultUrl(job: AIJob | null): string | null {
  if (!job?.result) return null;
  const imgs = job.result.images;
  if (Array.isArray(imgs) && imgs[0]?.url) return imgs[0].url;
  if (typeof job.result.output === 'string') return job.result.output;
  return null;
}

function SlotTile({
  label,
  uri,
  uploading,
  onPress,
}: {
  label: string;
  uri: string | null;
  uploading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      className="border border-[#D9D9D9] aspect-square items-center justify-center overflow-hidden"
    >
      {uploading ? (
        <ActivityIndicator color="#1A1A1A" />
      ) : uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : (
        <View className="items-center">
          {/* empty dress-silhouette guide */}
          <Ionicons name="shirt-outline" size={26} color="#C7C7C7" />
          <Text className="text-[8px] text-black/40 mt-1 uppercase tracking-[0.6px]">{label}</Text>
        </View>
      )}
      {uri && !uploading ? (
        <View className="absolute bottom-0 left-0 right-0 bg-black/55 py-1">
          <Text className="text-[8px] text-white text-center uppercase tracking-[0.6px]">
            {label} · Replace
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function AITryOnSetup({
  visible,
  dressId,
  onClose,
  onApproved,
}: {
  visible: boolean;
  dressId: number | null;
  onClose: () => void;
  onApproved?: (standardizedUrl: string) => void;
}) {
  const [images, setImages] = useState<DressImage[]>([]);
  const [uploadingRole, setUploadingRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<AIJob | null>(null);
  const [status, setStatus] = useState<string>('none');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const byRole = useMemo(() => {
    const m: Partial<Record<Role, DressImage>> = {};
    for (const img of images) if (!m[img.role]) m[img.role] = img;
    return m;
  }, [images]);

  const requiredCount = REQUIRED.filter((r) => byRole[r.role]).length;
  const completeness = completenessLabel(requiredCount);
  const allRequired = requiredCount >= REQUIRED.length;

  const refresh = useCallback(async () => {
    if (!dressId) return;
    try {
      const [imgs, dress] = await Promise.all([
        api.get(`/dresses/${dressId}/images`) as Promise<DressImage[]>,
        api.get(`/dresses/${dressId}`) as Promise<{ standardization_status?: string }>,
      ]);
      setImages(Array.isArray(imgs) ? imgs : []);
      setStatus(dress?.standardization_status ?? 'none');
    } catch {
      // non-fatal; the wizard still works for fresh uploads
    }
  }, [dressId]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  // Poll the standardize job while it's running so the review screen appears
  // when the backend marks the dress `ready`.
  useEffect(() => {
    if (!visible || !job || (job.status !== 'pending' && job.status !== 'submitted')) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const fresh = (await api.get(`/ai/jobs/${job.id}`)) as AIJob;
        setJob(fresh);
        if (fresh.status === 'completed' || fresh.status === 'failed') {
          await refresh();
        }
      } catch {
        // keep polling; transient errors are fine
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visible, job, refresh]);

  const pickAndUpload = async (role: Role) => {
    if (!dressId) return;
    if (!(await ensureMediaPermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });
    if (result.canceled) return;
    setUploadingRole(role);
    try {
      const form = new FormData();
      form.append('file', {
        uri: result.assets[0].uri,
        name: `${role}-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      form.append('role', role);
      await api.postMultipart(`/dresses/${dressId}/images`, form);
      await refresh();
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Please try again.');
    } finally {
      setUploadingRole(null);
    }
  };

  const startStandardize = async () => {
    if (!dressId) return;
    setLoading(true);
    try {
      const created = (await api.post(`/dresses/${dressId}/standardize`, {})) as AIJob;
      setJob(created);
      setStatus('pending');
    } catch (e: any) {
      Alert.alert('Could not start', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!dressId) return;
    setLoading(true);
    try {
      const dress = (await api.post(`/dresses/${dressId}/standardize/accept`, {})) as {
        standardized_image_url?: string;
      };
      onApproved?.(dress?.standardized_image_url ?? '');
      onClose();
    } catch (e: any) {
      Alert.alert('Could not accept', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const uploadManually = async () => {
    if (!dressId) return;
    if (!(await ensureMediaPermission('library'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 1,
    });
    if (result.canceled) return;
    setLoading(true);
    try {
      // Use the plain image-upload route (returns {url}, creates no DressImage
      // row) — the manual product photo is stored as the standardized image by
      // /standardize/manual, not as an angle row.
      const form = new FormData();
      form.append('file', {
        uri: result.assets[0].uri,
        name: `manual-${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      const up = (await api.postMultipart(`/dresses/upload-image`, form)) as { url?: string };
      if (!up?.url) throw new Error('Upload did not return a URL.');
      const dress = (await api.post(`/dresses/${dressId}/standardize/manual`, { url: up.url })) as {
        standardized_image_url?: string;
      };
      onApproved?.(dress?.standardized_image_url ?? '');
      onClose();
    } catch (e: any) {
      Alert.alert('Could not upload', e?.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const standardizedUrl = firstResultUrl(job) || byRole.standardized?.url || null;
  const isReady = status === 'ready' || job?.status === 'completed';
  const isRunning = job?.status === 'pending' || job?.status === 'submitted';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/30 justify-end">
        <View className="bg-white max-h-[88%]" style={{ borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
          <View className="px-5 pt-5 pb-3 flex-row items-center justify-between border-b border-[#EFEFEF]">
            <View className="flex-1 pr-3">
              <Text className="text-[16px] text-black" style={{ fontWeight: '600' }}>
                Improve AI Try-On Quality
              </Text>
              <Text className="text-[10px] text-black/45 mt-1 leading-4">
                For the best AI Try-On results, upload photos from multiple angles.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 16, paddingBottom: 28 }}>
            {/* Review screen once a standardized image is ready */}
            {isReady && standardizedUrl ? (
              <View>
                <Text className="text-[11px] uppercase tracking-[0.6px] text-black/45 mb-3">
                  Review standardized image
                </Text>
                <View className="flex-row gap-3 mb-5">
                  <View className="flex-1">
                    <Text className="text-[9px] text-black/40 mb-1 uppercase tracking-[0.6px]">Original (front)</Text>
                    <Image
                      source={{ uri: byRole.front?.url }}
                      style={{ width: '100%', height: 200 }}
                      contentFit="cover"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[9px] text-black/40 mb-1 uppercase tracking-[0.6px]">Generated studio image</Text>
                    <Image source={{ uri: standardizedUrl }} style={{ width: '100%', height: 200 }} contentFit="cover" />
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={accept}
                  disabled={loading}
                  className={`w-full py-4 items-center mb-3 ${loading ? 'bg-black/30' : 'bg-black'}`}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-[11px] uppercase tracking-[1.1px] text-white">Accept</Text>
                  )}
                </TouchableOpacity>
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={startStandardize}
                    disabled={loading}
                    className="flex-1 py-3.5 items-center border border-black"
                  >
                    <Text className="text-[10px] uppercase tracking-[1px] text-black">Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={uploadManually}
                    disabled={loading}
                    className="flex-1 py-3.5 items-center border border-[#D9D9D9]"
                  >
                    <Text className="text-[10px] uppercase tracking-[1px] text-black/70">Upload manually</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isRunning ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#1A1A1A" />
                <Text className="text-[11px] text-black/55 mt-4">Generating your studio image…</Text>
                <Text className="text-[9px] text-black/35 mt-1">This usually takes a few seconds.</Text>
              </View>
            ) : (
              <View>
                {/* Completeness */}
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-[11px] uppercase tracking-[0.6px] text-black/45">Setup completeness</Text>
                  <Text className="text-[11px]" style={{ color: completeness.color, fontWeight: '600' }}>
                    {completeness.label} · {completeness.pct}%
                  </Text>
                </View>
                <View className="h-1.5 bg-[#EEE] mb-5 overflow-hidden">
                  <View style={{ width: `${completeness.pct}%`, backgroundColor: completeness.color }} className="h-full" />
                </View>

                {/* Required 4-angle grid */}
                <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mb-2">Required angles</Text>
                <View className="flex-row flex-wrap" style={{ gap: 10 }}>
                  {REQUIRED.map((r) => (
                    <View key={r.role} style={{ width: '47%' }}>
                      <SlotTile
                        label={r.label}
                        uri={byRole[r.role]?.url ?? null}
                        uploading={uploadingRole === r.role}
                        onPress={() => pickAndUpload(r.role)}
                      />
                    </View>
                  ))}
                </View>

                {/* Optional swatch */}
                <Text className="text-[10px] uppercase tracking-[0.6px] text-black/45 mt-5 mb-2">
                  Colour swatch (optional, improves ivory/champagne accuracy)
                </Text>
                <View style={{ width: '47%' }}>
                  <SlotTile
                    label="Swatch"
                    uri={byRole.swatch?.url ?? null}
                    uploading={uploadingRole === 'swatch'}
                    onPress={() => pickAndUpload('swatch')}
                  />
                </View>

                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={startStandardize}
                  disabled={!allRequired || loading}
                  className={`w-full py-4 items-center mt-7 ${!allRequired || loading ? 'bg-black/30' : 'bg-black'}`}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-[11px] uppercase tracking-[1.1px] text-white">
                      {allRequired ? 'Generate standardized image' : 'Upload all 4 angles to continue'}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.9} onPress={uploadManually} disabled={loading} className="w-full py-3 items-center mt-2">
                  <Text className="text-[10px] uppercase tracking-[1px] text-black/50">
                    Skip — upload my own product photo
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
