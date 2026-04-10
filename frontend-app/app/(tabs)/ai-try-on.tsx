import React, { useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Dimensions, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function AITryOnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [countdown, setCountdown] = useState(5);
  const [showErrorModal, setShowErrorModal] = useState(false);

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
      image: require('@/assets/images/AI Test 3.jpg'),
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
      image: require('@/assets/images/AI Test 3.jpg'),
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
      image: require('@/assets/images/AI Test 3.jpg'),
      instructions: "WE'RE CREATE YOUR LOOK, AND IT MIGHT TAKE UP TO 2 MINS, WE'LL LET YOU KNOW WHEN IT'S READY",
    }
  ];

  const currentStep = steps[step - 1];

  const handleNext = () => {
    if (step < steps.length) {
      if (step === 5) {
        setStep(step + 1);
        let count = 5;
        const interval = setInterval(() => {
          count -= 1;
          setCountdown(count);
          if (count === 0) {
            clearInterval(interval);
            setStep(7); // Jump to analysis
          }
        }, 1000);
      } else if (step === 7) {
        setShowErrorModal(true); // Demo the error case
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
              <Image 
                source={require('@/assets/images/AI Test 3.jpg')} 
                style={{ width: '100%', height: '100%' }} 
                contentFit="cover" 
              />
              {currentStep.type === 'countdown' && (
                <View className="absolute items-center justify-center">
                  <Text className="text-white text-[120px] font-bold opacity-80">{countdown}</Text>
                </View>
              )}
            </View>
            <View className="items-center mb-10">
              <Text className="text-[#1A1A1A] text-[10px] font-medium uppercase tracking-[1px] opacity-60">
                {currentStep.instructions}
              </Text>
            </View>
            
            {currentStep.type === 'camera' && (
              <View className="flex-row justify-between items-center mb-10 px-8">
                <TouchableOpacity className="w-10 h-10 rounded-lg overflow-hidden border border-black/10">
                  <Image source={require('@/assets/images/Dashboard image 1.png')} style={{ width: '100%', height: '100%' }} />
                </TouchableOpacity>
                <TouchableOpacity 
                   onPress={handleNext}
                   className="w-16 h-16 rounded-full border-4 border-black items-center justify-center"
                >
                  <View className="w-12 h-12 bg-black rounded-full" />
                </TouchableOpacity>
                <TouchableOpacity className="w-10 h-10 items-center justify-center">
                  <Ionicons name="camera-reverse-outline" size={28} color="black" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        );

      case 'confirmation':
      case 'analysis':
        return (
          <View className="flex-1 px-8">
            <View className="items-center justify-center flex-1 mb-10 overflow-hidden">
              <Image source={currentStep.image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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
              <Image source={currentStep.image} style={{ width: '100%', height: '100%' }} contentFit="cover" />
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


