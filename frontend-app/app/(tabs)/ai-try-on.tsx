import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '@shared/api/api';

const { width } = Dimensions.get('window');

export default function AITryOnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [countdown, setCountdown] = useState(5);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [fullBodyUri, setFullBodyUri] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const steps = [
    {
      id: 1,
      type: 'instruction',
      image: require('@/assets/images/AI Try 1.png'),
      instructions: "MAKE NEED THE PHOTO: IS WELL LIT AND THAT YOUR'RE THE ONLY ONE IN IT, WITH ON GLASSES, HATS OR HEADPHONES",
    },
    {
      id: 2,
      type: 'instruction',
      image: require('@/assets/images/AI try 2.png'),
      instructions: "WE NEED TWO PHOTOS: A SELFIE AND A FULL BODY SHOT",
    },
    {
      id: 3,
      type: 'camera',
      instructions: "TAKE A SELFIE! YOU'LL NEED GOOD LIGHTING",
    },
    {
      id: 4,
      type: 'confirmation',
      instructions: "FIRST IMAGE",
    },
    {
      id: 5,
      type: 'camera',
      instructions: "NOW TAKE A FULL-BODY PHOTO",
    },
    {
      id: 6,
      type: 'countdown',
      instructions: "NOW TAKE A FULL-BODY PHOTO",
    },
    {
      id: 7,
      type: 'analysis',
      image: require('@/assets/images/AI Try 1.png'),
      instructions: "ALL SET! WE'VE GOT ALL THE PHOTO",
    },
    {
      id: 8,
      type: 'result',
      instructions: "WE'RE CREATE YOUR LOOK, AND IT MIGHT TAKE UP TO 2 MINS, WE'LL LET YOU KNOW WHEN IT'S READY",
    }
  ];

  const currentStep = steps[step - 1];

  const activePreviewUri = useMemo(() => {
    if (currentStep.id === 4) return selfieUri;
    if (currentStep.id === 7 || currentStep.id === 8) return fullBodyUri || selfieUri;
    return null;
  }, [currentStep.id, fullBodyUri, selfieUri]);

  useEffect(() => {
    // Ensure facing makes sense for each capture step
    if (currentStep.id === 3) setCameraFacing('front');
    if (currentStep.id === 5 || currentStep.id === 6) setCameraFacing('back');
  }, [currentStep.id]);

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
          });
          if (!cancelled && pic?.uri) {
            setFullBodyUri(pic.uri);
            setValidating(true);
            setValidationError(null);
            try {
              const form = new FormData();
              form.append(
                'file',
                {
                  uri: pic.uri,
                  name: `full-body-${Date.now()}.jpg`,
                  type: 'image/jpeg',
                } as any
              );
              const res = (await api.postMultipart('/ai/validate-full-body', form)) as { ok?: boolean; reason?: string };
              if (!res?.ok) {
                setValidationError(res?.reason || 'Please retake the photo with your full body in view.');
                setStep(5);
                return;
              }
              setStep(7);
            } catch (e: any) {
              setValidationError(e?.message || 'Could not validate the photo. Please try again.');
              setStep(5);
              return;
            } finally {
              setValidating(false);
            }
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
  }, [step]);

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
        });
        if (!pic?.uri) return;
        setSelfieUri(pic.uri);
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
        // Move to final preview/result
        setStep(8);
      } else {
        setStep(step + 1);
      }
    } else {
      router.push('/(tabs)/video-call'); 
    }
  };

  const renderContent = () => {
    switch (currentStep.type) {
      case 'instruction':
        return (
          <View className="flex-1 px-8">
            <View className="flex-row justify-center gap-2 mt-4">
              {steps.filter(s => s.type === 'instruction').map((s) => (
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
              <View className="flex-row justify-between items-center mb-10 px-8">
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
              {showErrorModal && (
                <View className="absolute inset-0 bg-white/20 items-center justify-center px-8">
                  <View className="bg-white p-6 items-center shadow-lg border border-black/5">
                    <Text className="text-black text-[12px] text-center mb-6 leading-5 font-light">
                      The body data is incomplete. Please provide a full and unobstructed view.
                    </Text>
                    <TouchableOpacity 
                      onPress={() => {
                        setShowErrorModal(false);
                        setStep(8);
                      }}
                      className="w-full border border-black/20 py-3 items-center"
                    >
                      <Text className="text-black text-[10px] font-bold uppercase tracking-[1px]">Accept</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
            <View className="items-center mb-10">
              <Text className="text-[#1A1A1A] text-[10px] font-bold uppercase tracking-[2px]">
                {currentStep.instructions}
              </Text>
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
      {(currentStep.type === 'instruction' || currentStep.type === 'confirmation' || currentStep.type === 'analysis' || currentStep.type === 'result') && !showErrorModal && (
        <View 
          className="absolute bottom-0 left-0 right-0 bg-white px-8 pt-4 pb-12"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={handleNext}
            className="w-full bg-black py-5 items-center justify-center"
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">
              {currentStep.type === 'result' ? 'Use AI to take measurement' : 'Continue'}
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
        </View>
      )}
    </SafeAreaView>
  );
}


