import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, Dimensions, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width, height } = Dimensions.get('window');

type CallState = 'waiting' | 'active';

export default function VideoCallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [callState, setCallState] = useState<CallState>('waiting');
  const [seconds, setSeconds] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  
  const [permission, requestPermission] = useCameraPermissions();

  const toggleCamera = async () => {
    if (!cameraOn) {
      const currentPermission = permission || await requestPermission();
      if (!currentPermission.granted) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert('Permission Denied', 'We need camera permission to show your video fitting.');
          return;
        }
      }
    }
    setCameraOn(!cameraOn);
  };

  // Simulate advisor joining after 5 seconds
  useEffect(() => {
    const timeout = setTimeout(() => {
      setCallState('active');
    }, 5000);
    return () => clearTimeout(timeout);
  }, []);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (callState === 'active') {
      interval = setInterval(() => {
        setSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View 
        className="px-6 py-4 flex-row justify-between items-center bg-white"
        style={{ paddingTop: insets.top + 10 }}
      >
        <View className="flex-1">
          <Text className="text-black text-sm font-medium">
            {callState === 'waiting' ? 'Waiting For Advisor To Join' : 'Live Video Fitting'}
          </Text>
        </View>
        
        {callState === 'waiting' ? (
          <View className="flex-row items-center bg-[#F2FBF6] px-2 py-1 rounded-full mr-4">
            <View className="w-2 h-2 rounded-full bg-[#34C759] mr-2" />
            <Text className="text-[#34C759] text-[10px] font-medium uppercase">Good Connection</Text>
          </View>
        ) : (
          <View className="flex-row items-center bg-[#F2FBF6] px-2 py-1 rounded-full mr-4">
            <View className="w-2 h-2 rounded-full bg-[#34C759] mr-2" />
            <Text className="text-[#34C759] text-[10px] font-medium">{formatTime(seconds)}</Text>
          </View>
        )}


        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="black" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {/* Video Area */}
        <View className="px-6 mb-8 mt-4">
          <View 
            className={`w-full aspect-[3/4] rounded-3xl overflow-hidden relative ${cameraOn ? 'bg-transparent' : 'bg-black'}`}
            style={{ 
              elevation: 5, 
              shadowColor: '#000', 
              shadowOffset: { width: 0, height: 4 }, 
              shadowOpacity: 0.15, 
              shadowRadius: 10 
            }}
          >
            {cameraOn ? (
              <CameraView 
                key="camera-view"
                style={{ width: '100%', height: '100%' }}
                facing="front"
              />
            ) : (


              <View className="flex-1 items-center justify-center">
                <MaterialCommunityIcons name="video-off-outline" size={48} color="white" opacity={0.3} />
                <Text className="text-white/30 text-xs mt-4 font-light uppercase tracking-[1px]">Camera Off</Text>
              </View>
            )}

            {/* Advisor Inset (Only when active) */}
            {callState === 'active' && (
              <View 
                className="absolute top-4 right-4 w-28 h-36 bg-white rounded-2xl border-2 border-white/40 overflow-hidden"
                style={{ elevation: 10, shadowColor: '#000', shadowOpacity: 0.2 }}
              >
                <Image 
                  source={require('@/assets/images/Dashboard image 2.png')} 
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
            )}
          </View>

          {/* Controls */}
          <View className="flex-row justify-center gap-8 mt-10">
            <TouchableOpacity 
              onPress={() => setMicOn(!micOn)}
              activeOpacity={0.8}
              className={`w-14 h-14 rounded-full items-center justify-center ${micOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
              style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={micOn ? "mic" : "mic-off"} size={22} color={micOn ? "black" : "white"} />
            </TouchableOpacity>
            
            <TouchableOpacity 
               onPress={toggleCamera}
               activeOpacity={0.8}
               className={`w-14 h-14 rounded-full items-center justify-center ${cameraOn ? 'bg-[#F9F9F9]' : 'bg-[#FF3B30]'}`}
               style={{ elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5 }}
            >
              <Feather name={cameraOn ? "video" : "video-off"} size={22} color={cameraOn ? "black" : "white"} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Text */}
        <View className="px-8 items-center mb-10">
          <Text className="text-black text-lg font-medium text-center mb-2">
            {callState === 'waiting' ? 'Waiting For Advisor To Join' : 'Advisory Support Live'}
          </Text>
          <Text className="text-black/50 text-[13px] text-center px-6 leading-5">
            {callState === 'waiting' 
              ? 'Your session will begin automatically as soon as boutique advisor joins.'
              : 'Advisor can control Try-On and switch dresses for you.'}
          </Text>
        </View>

        {/* Preparation Tips Section (only when waiting) */}
        {callState === 'waiting' && (
          <View className="px-8 pb-10">
            <View className="bg-[#F9F9F9] p-6 rounded-2xl">
              <Text className="text-black text-[12px] font-bold uppercase mb-6 tracking-[1px] opacity-40">Preparation Tips</Text>
              <View className="gap-5">
                {[
                  'Ensure you are in a well-lit room',
                  'Stand 2-3 meters back for full body view',
                  'Wear tight-fitting clothes for accurate AI'
                ].map((tip, i) => (
                  <View key={i} className="flex-row items-center">
                    <View className="bg-[#34C759] rounded-full p-[3px] mr-4">
                      <Ionicons name="checkmark" size={12} color="white" />
                    </View>
                    <Text className="text-black/70 text-[13px] font-light">{tip}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer (only when active) */}
      {callState === 'active' && (
        <View 
          className="absolute bottom-0 left-0 right-0 bg-white/90 px-8 pt-6 pb-12 border-t border-[#F5F5F5]"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <TouchableOpacity 
            activeOpacity={0.9}
            onPress={() => router.push('/(tabs)/checkout')}
            className="w-full bg-black py-5 rounded-sm items-center justify-center shadow-lg"
          >
            <Text className="text-white text-[12px] font-bold tracking-[3px] uppercase">End Call & Choose Dress</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
