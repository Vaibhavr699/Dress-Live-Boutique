import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';

type Dress = {
  id: number;
  name?: string | null;
  image_url?: string | null;
  ai_model_url?: string | null;
  is_ai_enabled?: boolean | null;
  boutique_id?: number | null;
};

function toJpegDataUrl(base64: string) {
  return `data:image/jpeg;base64,${base64}`;
}

type SavedTestingImage = {
  uri: string;
  dataUrl: string;
};

let cachedSelfieImage: SavedTestingImage | null = null;
let cachedFullBodyImage: SavedTestingImage | null = null;

export default function AITryOnScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dressId?: string; source?: string }>();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [countdown, setCountdown] = useState(5);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [fullBodyUri, setFullBodyUri] = useState<string | null>(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [validating, setValidating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [renderedUri, setRenderedUri] = useState<string | null>(null);
  const [dress, setDress] = useState<Dress | null>(null);
  const [dressLoading, setDressLoading] = useState(false);
  const [savedSelfie, setSavedSelfie] = useState<SavedTestingImage | null>(cachedSelfieImage);
  const [savedFullBody, setSavedFullBody] = useState<SavedTestingImage | null>(cachedFullBodyImage);

  const normalizedDressId = useMemo(() => {
    const raw = typeof params.dressId === 'string' ? Number(params.dressId) : NaN;
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [params.dressId]);

  const steps = [
    {
      id: 1,
      type: 'instruction',
      image: require('@/assets/images/AI Try 1.png'),
      instructions: 'We will create a dress preview using one selfie and one clear full-body photo.',
    },
    {
      id: 2,
      type: 'instruction',
      image: require('@/assets/images/AI try 2.png'),
      instructions: 'Use bright lighting and make sure only you are visible, with your full body inside the frame.',
    },
    {
      id: 3,
      type: 'camera',
      instructions: 'Take a clear selfie in good lighting.',
    },
    {
      id: 4,
      type: 'confirmation',
      instructions: 'Selfie captured',
    },
    {
      id: 5,
      type: 'camera',
      instructions: 'Now take a full-body photo with your full silhouette visible.',
    },
    {
      id: 6,
      type: 'countdown',
      instructions: 'Hold still while we capture your full-body photo.',
    },
    {
      id: 7,
      type: 'analysis',
      instructions: 'Creating your AI dress preview',
    },
    {
      id: 8,
      type: 'result',
      instructions: 'Your AI preview is ready. Review the look before you continue to booking.',
    },
  ];

  const currentStep = steps[step - 1];

  const activePreviewUri = useMemo(() => {
    if (currentStep.id === 4) return selfieUri;
    if (currentStep.id === 7) return renderedUri || fullBodyUri || selfieUri;
    if (currentStep.id === 8) return renderedUri || fullBodyUri || selfieUri;
    return null;
  }, [currentStep.id, fullBodyUri, renderedUri, selfieUri]);

  useEffect(() => {
    if (!normalizedDressId) {
      setDress(null);
      return;
    }

    let mounted = true;
    setDressLoading(true);
    api
      .get(`/dresses/${normalizedDressId}`)
      .then((res) => {
        if (mounted) {
          setDress(res as Dress);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setDress(null);
        Alert.alert('AI Try On', error instanceof Error ? error.message : 'Could not load the selected dress.');
      })
      .finally(() => {
        if (mounted) setDressLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [normalizedDressId]);

  useEffect(() => {
    // Ensure facing makes sense for each capture step
    if (currentStep.id === 3) setCameraFacing('front');
    if (currentStep.id === 5 || currentStep.id === 6) setCameraFacing('back');
  }, [currentStep.id]);

  const createTryOnPreview = useCallback(async (fullBodyImageDataUrl: string) => {
    if (!normalizedDressId) {
      throw new Error('Open AI Try On from a specific dress to generate a preview.');
    }

    const res = (await api.post('/ai/preview-tryon-base64', {
      dress_id: normalizedDressId,
      full_body_image_data_url: fullBodyImageDataUrl,
      ...(selfieDataUrl ? { selfie_image_data_url: selfieDataUrl } : {}),
    })) as {
      image_data_url?: string | null;
    };
    if (!res?.image_data_url) {
      throw new Error('The AI preview was created, but no image was returned.');
    }
    setRenderedUri(res.image_data_url);
  }, [normalizedDressId, selfieDataUrl]);

  const processFullBodyCandidate = useCallback(async (candidate: SavedTestingImage) => {
    setFullBodyUri(candidate.uri);
    setValidating(true);
    setRendering(false);
    setRenderedUri(null);
    setValidationError(null);

    try {
      const res = (await api.post('/ai/validate-full-body-base64', {
        image_data_url: candidate.dataUrl,
      })) as { ok?: boolean; reason?: string };

      if (!res?.ok) {
        setValidationError(res?.reason || 'Please retake the photo with your full body in view.');
        setStep(5);
        return;
      }

      cachedFullBodyImage = candidate;
      setSavedFullBody(candidate);
      setValidating(false);
      setRendering(true);
      setStep(7);

      try {
        await createTryOnPreview(candidate.dataUrl);
        setStep(8);
      } catch (renderError: any) {
        setValidationError(renderError?.message || 'Could not create your AI preview. Please try again.');
        setStep(5);
      } finally {
        setRendering(false);
      }
    } catch (error: any) {
      setValidationError(error?.message || 'Could not validate the photo. Please try again.');
      setStep(5);
    } finally {
      setValidating(false);
    }
  }, [createTryOnPreview]);

  const pickImageFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission', 'Please allow photo library access to continue.');
      return null;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
      base64: true,
    });

    if (result.canceled) return null;
    const asset = result.assets?.[0];
    if (!asset?.uri || !asset.base64) {
      Alert.alert('AI Try On', 'Could not read the selected image. Please try again.');
      return null;
    }

    return {
      uri: asset.uri,
      dataUrl: toJpegDataUrl(asset.base64),
    } satisfies SavedTestingImage;
  }, []);

  useEffect(() => {
    if (step !== 6) return;
    // Countdown for the full-body photo, then capture automatically.
    let cancelled = false;
    let count = 5;
    setCountdown(count);
    const id = setInterval(async () => {
      count -= 1;
      if (cancelled) return;
      setCountdown(count);
      if (count === 0) {
        clearInterval(id);
        try {
          const pic = await cameraRef.current?.takePictureAsync({
            quality: 0.8,
            mirror: false,
            base64: true,
          });
          if (!cancelled && pic?.uri) {
            if (!pic.base64) {
              throw new Error('Could not read the photo. Please try again.');
            }
            await processFullBodyCandidate({
              uri: pic.uri,
              dataUrl: toJpegDataUrl(pic.base64),
            });
          }
        } catch {
          // ignore
        }
      }
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [createTryOnPreview, step]);

  const ensureCameraPermission = async () => {
    if (permission?.granted) return true;
    const res = await requestPermission();
    return !!res?.granted;
  };

  const handleCapture = async () => {
    const ok = await ensureCameraPermission();
    if (!ok) {
      Alert.alert('Camera permission', 'Please allow camera access to continue.');
      return;
    }
    try {
      if (currentStep.id === 3) {
        const pic = await cameraRef.current?.takePictureAsync({
          quality: 0.85,
          mirror: false,
          base64: true,
        });
        if (!pic?.uri) return;
        if (!pic.base64) {
          Alert.alert('AI Try On', 'Could not capture the selfie. Please try again.');
          return;
        }
        setSelfieUri(pic.uri);
        const candidate = { uri: pic.uri, dataUrl: toJpegDataUrl(pic.base64) };
        setSelfieDataUrl(candidate.dataUrl);
        cachedSelfieImage = candidate;
        setSavedSelfie(candidate);
        setStep(4);
        return;
      }
      if (currentStep.id === 5) {
        // Start countdown capture (step 6 will take the photo)
        setStep(6);
        return;
      }
    } catch {
      // ignore
    }
  };

  const handlePickFromGallery = async () => {
    const picked = await pickImageFromGallery();
    if (!picked) return;

    if (currentStep.id === 3) {
      setSelfieUri(picked.uri);
      setSelfieDataUrl(picked.dataUrl);
      cachedSelfieImage = picked;
      setSavedSelfie(picked);
      setStep(4);
      return;
    }

    if (currentStep.id === 5) {
      await processFullBodyCandidate(picked);
    }
  };

  const handleUseSavedTestingPhoto = async () => {
    if (currentStep.id === 3 && savedSelfie) {
      setSelfieUri(savedSelfie.uri);
      setSelfieDataUrl(savedSelfie.dataUrl);
      setStep(4);
      return;
    }

    if (currentStep.id === 5 && savedFullBody) {
      await processFullBodyCandidate(savedFullBody);
    }
  };

  const handleNext = () => {
    if (step < steps.length) {
      if (step === 4) {
        // Only continue if selfie exists
        if (!selfieUri) {
          Alert.alert('Selfie missing', 'Please take a selfie to continue.');
          setStep(3);
          return;
        }
        setStep(5);
      } else if (step === 7) {
        return;
      } else if (step === 8) {
        router.back();
      } else {
        setStep(step + 1);
      }
    } else {
      router.back();
    }
  };

  const renderContent = () => {
    switch (currentStep.type) {
      case 'instruction':
        return (
          <View className="flex-1 px-8">
            <View className="items-center mt-4 mb-2">
              {dressLoading ? (
                <ActivityIndicator color="#1A1A1A" />
              ) : dress ? (
                <View className="w-full border border-black/10 px-4 py-3 flex-row items-center">
                  <Image
                    source={
                      dress.image_url
                        ? { uri: dress.image_url }
                        : require('@/assets/images/Dashboard image 3.png')
                    }
                    style={{ width: 44, height: 56, borderRadius: 4 }}
                    contentFit="cover"
                  />
                  <View className="ml-3 flex-1">
                    <Text className="text-black text-[10px] font-bold uppercase tracking-[1px] opacity-55">
                      Selected dress
                    </Text>
                    <Text className="text-black text-[13px] font-medium mt-1">
                      {(dress.name || '').trim() || `Dress #${dress.id}`}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className="w-full border border-[#F0D7C8] bg-[#FFF8F3] px-4 py-3">
                  <Text className="text-[#C9491A] text-[11px] leading-5 text-center">
                    Open AI Try On from a dress page so we know which dress to preview on you.
                  </Text>
                </View>
              )}
            </View>
            <View className="flex-row justify-center gap-2 mt-4">
              {steps.filter((s) => s.type === 'instruction').map((s) => (
                <View key={s.id} className={`h-1 w-8 ${step === s.id ? 'bg-black' : 'bg-black/10'} rounded-full`} />
              ))}
            </View>
            <View className="items-center justify-center h-[55%] mt-4">
              <Image source={currentStep.image} style={{ width: '100%', height: '100%' }} contentFit="contain" />
            </View>
            <View className="items-center mt-8 px-4 h-[100px] justify-center">
              <Text className="text-[#1A1A1A] text-[13px] font-medium text-center leading-5 uppercase tracking-[0.5px]">
                {currentStep.instructions}
              </Text>
            </View>
          </View>
        );

      case 'camera':
      case 'countdown':
        return (
          <View className="flex-1 px-8">
            <View className="items-center justify-center flex-1 mb-10 overflow-hidden">
              <CameraView
                ref={(r) => {
                  cameraRef.current = r;
                }}
                facing={cameraFacing}
                mirror={cameraFacing === 'front'}
                style={{ width: '100%', height: '100%' }}
              />
              {currentStep.type === 'countdown' && (
                <View className="absolute items-center justify-center">
                  <Text className="text-white text-[120px] font-bold opacity-80">{countdown}</Text>
                </View>
              )}
              {validating ? (
                <View className="absolute inset-0 bg-black/35 items-center justify-center px-8">
                  <View className="bg-white px-6 py-5 items-center border border-black/5">
                    <ActivityIndicator color="#1A1A1A" />
                    <Text className="text-black text-[11px] mt-3 uppercase tracking-[1px]">Validating photo…</Text>
                    <Text className="text-black/45 text-[11px] mt-2 text-center leading-5">
                      Please wait while we check that your full body is visible.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
            <View className="items-center mb-10">
              <Text className="text-[#1A1A1A] text-[10px] font-medium uppercase tracking-[1px] opacity-60">
                {currentStep.instructions}
              </Text>
            </View>
            
            {currentStep.type === 'camera' && (
              <View className="mb-10 px-8">
                <View className="flex-row justify-between items-center">
                  <TouchableOpacity className="w-10 h-10 rounded-lg overflow-hidden border border-black/10">
                    <Image
                      source={
                        activePreviewUri ? { uri: activePreviewUri } : require('@/assets/images/Dashboard image 1.png')
                      }
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity 
                     onPress={handleCapture}
                     className="w-16 h-16 rounded-full border-4 border-black items-center justify-center"
                  >
                    <View className="w-12 h-12 bg-black rounded-full" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="w-10 h-10 items-center justify-center"
                    onPress={() => setCameraFacing((f) => (f === 'front' ? 'back' : 'front'))}
                  >
                    <Ionicons name="camera-reverse-outline" size={28} color="black" />
                  </TouchableOpacity>
                </View>

                <View className="mt-6">
                  <TouchableOpacity
                    onPress={handlePickFromGallery}
                    activeOpacity={0.85}
                    className="border border-black py-3 items-center mb-3"
                  >
                    <Text className="text-black text-[10px] font-bold uppercase tracking-[1px]">Choose from gallery</Text>
                  </TouchableOpacity>

                  {((currentStep.id === 3 && savedSelfie) || (currentStep.id === 5 && savedFullBody)) ? (
                    <TouchableOpacity
                      onPress={handleUseSavedTestingPhoto}
                      activeOpacity={0.85}
                      className="border border-black/15 py-3 items-center bg-black/[0.03]"
                    >
                      <Text className="text-black text-[10px] font-medium uppercase tracking-[1px]">
                        {currentStep.id === 3 ? 'Use saved selfie' : 'Use saved full-body photo'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <Text className="text-black/35 text-[10px] text-center mt-3 leading-4">
                    Testing shortcut: reuse saved images instead of capturing again.
                  </Text>
                </View>
              </View>
            )}

            {currentStep.type === 'countdown' ? (
              <View className="items-center mb-10">
                <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[1.5px]">
                  Hold still…
                </Text>
              </View>
            ) : null}

            {validationError ? (
              <View className="items-center mb-6 px-6">
                <Text className="text-[#C9491A] text-[11px] text-center leading-5">
                  {validationError}
                </Text>
              </View>
            ) : null}
          </View>
        );

      case 'confirmation':
      case 'analysis':
        return (
          <View className="flex-1 px-8">
            <View className="items-center justify-center flex-1 mb-10 overflow-hidden">
              <Image
                source={
                  activePreviewUri ? { uri: activePreviewUri } : require('@/assets/images/AI Test 3.jpg')
                }
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
              {currentStep.type === 'analysis' || rendering ? (
                <View className="absolute inset-0 bg-white/35 items-center justify-center px-8">
                  <View className="bg-white px-6 py-5 items-center border border-black/5">
                    <ActivityIndicator color="#1A1A1A" />
                    <Text className="text-black text-[11px] mt-3 uppercase tracking-[1px]">Creating preview…</Text>
                    <Text className="text-black/45 text-[11px] mt-2 text-center leading-5">
                      We are aligning the selected dress to your full-body photo.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
            <View className="items-center mb-10">
              <Text className="text-[#1A1A1A] text-[10px] font-bold uppercase tracking-[2px] text-center">
                {currentStep.instructions}
              </Text>
              {currentStep.type === 'analysis' ? (
                <Text className="text-black/45 text-[11px] leading-5 mt-3 text-center px-6">
                  This first version uses your selected dress image to create a quick preview before booking.
                </Text>
              ) : null}
            </View>
          </View>
        );

      case 'result':
        return (
          <View className="flex-1 px-8">
            <View className="items-center justify-center flex-1 mb-10 overflow-hidden">
              <Image
                source={
                  activePreviewUri ? { uri: activePreviewUri } : require('@/assets/images/AI Test 3.jpg')
                }
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <View className="items-center mb-10">
              <Text className="text-[#1A1A1A] text-[12px] font-medium text-center leading-5 uppercase tracking-[0.5px]">
                {currentStep.instructions}
              </Text>
              {dress ? (
                <Text className="text-black/45 text-[11px] leading-5 mt-3 text-center px-6">
                  Preview generated for {(dress.name || '').trim() || `Dress #${dress.id}`}. You can now continue to booking from the dress page.
                </Text>
              ) : null}
            </View>
          </View>
        );
      
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View 
        className="px-6 flex-row justify-between items-center bg-white mb-2"
        style={{ paddingTop: insets.top }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="black" />
        </TouchableOpacity>
        <Text className="text-black text-[10px] font-bold uppercase tracking-[2px]">
          {currentStep.type === 'camera' ? 'Click Photo' : currentStep.type === 'result' ? 'View Your Look' : 'AI Try On'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {renderContent()}

      {/* Footer Bottom Button */}
      {(currentStep.type === 'instruction' ||
        currentStep.type === 'confirmation' ||
        currentStep.type === 'analysis' ||
        currentStep.type === 'result') && (
        <View 
          className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-12"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={handleNext}
            disabled={currentStep.type === 'analysis' || rendering}
            className="w-full bg-black py-5 items-center justify-center"
            style={{ opacity: currentStep.type === 'analysis' || rendering ? 0.55 : 1 }}
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">
              {currentStep.type === 'result' ? 'Done' : currentStep.type === 'analysis' ? 'Creating preview' : 'Continue'}
            </Text>
          </TouchableOpacity>
          {currentStep.type === 'confirmation' && (
            <TouchableOpacity 
              onPress={() => setStep(step - 1)}
              className="mt-4 items-center"
            >
              <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[1.5px]">Repeat</Text>
            </TouchableOpacity>
          )}
          {currentStep.type === 'result' ? (
            <TouchableOpacity
              onPress={() => {
                setRenderedUri(null);
                setValidationError(null);
                setFullBodyUri(null);
                setStep(5);
              }}
              className="mt-4 items-center"
            >
              <Text className="text-black/40 text-[10px] font-bold uppercase tracking-[1.5px]">Retake full-body photo</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}


