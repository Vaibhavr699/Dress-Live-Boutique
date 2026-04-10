import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@shared/api/api';

type OnboardingStep = 'plan' | 'shop_info' | 'owner_info' | 'store_photos';

const FEATURES = [
    "Bridal Dress Storefront",
    "Unlimited Dress Listings",
    "Custom Dress Orders",
    "Bohemian Wedding Dresses",
    "Bridal Party Dress Management",
    "Wedding Dress Matching",
    "Order Management Dashboard",
    "Customer Messaging",
    "Appointment Scheduling",
    "Size & Measurement Management",
    "Secure Payment Processing"
];

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  
  const [step, setStep] = useState<OnboardingStep>('plan');
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [shopName, setShopName] = useState('');
  const [shopDescription, setShopDescription] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Images
  const [logo, setLogo] = useState<string | null>(null);
  const [ownerImage, setOwnerImage] = useState<string | null>(null);
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [insideImage, setInsideImage] = useState<string | null>(null);

  const [showPassword, setShowPassword] = useState(false);

  const pickImage = async (setter: (uri: string) => void) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need permission to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setter(result.assets[0].uri);
    }
  };

  const handleFinalSignup = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // 1. Create User/Boutique Profile
      // For now we simulate the full creation with the new data structure
      await api.post('/users/', {
        email,
        password,
        full_name: ownerName,
        boutique_info: {
            name: shopName,
            description: shopDescription,
            address: address,
            phone: phone,
            plan: plan
        }
      });

      Alert.alert(
        'Success', 
        'Your Boutique Portal has been prepared! Please log in.',
        [{ text: 'OK', onPress: () => router.replace('/login') }]
      );
    } catch (error: any) {
      Alert.alert('Signup Failed', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderProgressBar = (current: string) => (
    <View className="flex-row items-center justify-between mb-10">
        <View className="h-[2px] bg-black flex-1 mr-4" style={{ opacity: current === '1/3' ? 1 : current === '2/3' ? 1 : 1 }} />
        <Text className="text-[10px] font-bold tracking-[2px]">{current}</Text>
    </View>
  );

  const renderStepPlan = () => (
    <View className="flex-1">
        <TouchableOpacity onPress={() => router.back()} className="mb-8">
            <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>

        <Text className="text-2xl font-bold mb-6" style={{ fontFamily: 'Helvetica Neue' }}>Subscription Plan</Text>
        
        <View className="mb-8">
            <Text className="text-sm font-bold mb-2">Grow Your Bridal Business</Text>
            <Text className="text-xs text-black/50 leading-5">
                Join the platform where brides discover, customize, and purchase their dream wedding dresses. Showcase your designs, manage orders, and connect with brides planning their big day.
            </Text>
        </View>

        <Text className="text-[10px] font-bold uppercase tracking-[1px] mb-6">Enjoy All Features Lists</Text>
        
        <View className="gap-3 mb-12">
            {FEATURES.map((feat, i) => (
                <View key={i} className="flex-row items-center">
                    <Ionicons name="checkmark" size={16} color="black" className="mr-3" />
                    <Text className="text-xs text-black/70">{feat}</Text>
                </View>
            ))}
        </View>

        <View className="gap-4 mb-10">
            <TouchableOpacity 
                onPress={() => setPlan('monthly')}
                className={`p-5 flex-row justify-between items-center border ${plan === 'monthly' ? 'border-black' : 'border-gray-200'}`}
            >
                <View className="flex-row items-center">
                    <View className={`w-4 h-4 rounded-full border items-center justify-center mr-3 ${plan === 'monthly' ? 'border-black' : 'border-gray-300'}`}>
                        {plan === 'monthly' && <View className="w-2 h-2 rounded-full bg-black" />}
                    </View>
                    <Text className="text-xs font-bold">Monthly 59.90€</Text>
                </View>
                <Text className="text-[10px] text-black/40 uppercase">Billed Monthly</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                onPress={() => setPlan('annual')}
                className={`p-5 flex-row justify-between items-center border ${plan === 'annual' ? 'border-black' : 'border-gray-200'}`}
            >
                <View className="flex-row items-center">
                    <View className={`w-4 h-4 rounded-full border items-center justify-center mr-3 ${plan === 'annual' ? 'border-black' : 'border-gray-300'}`}>
                        {plan === 'annual' && <View className="w-2 h-2 rounded-full bg-black" />}
                    </View>
                    <Text className="text-xs font-bold">Annual 99.90€</Text>
                </View>
                <View className="bg-gray-100 px-3 py-1">
                    <Text className="text-[10px] uppercase font-bold">Popular</Text>
                </View>
            </TouchableOpacity>
        </View>

        <TouchableOpacity 
            onPress={() => setStep('shop_info')}
            className="bg-black py-5 items-center rounded-sm"
        >
            <Text className="text-white text-xs font-bold tracking-[2px] uppercase">Subscribe Plan</Text>
        </TouchableOpacity>
    </View>
  );

  const renderStepShopInfo = () => (
    <View className="flex-1">
        {renderProgressBar('1/3')}
        
        <View className="items-center mb-10">
            <View className="bg-gray-50 p-4 mb-4">
                <Text className="font-bold text-xs uppercase tracking-[2px]">Logo Icon</Text>
            </View>
            <Text className="text-2xl text-center mb-2" style={{ fontFamily: 'Helvetica Neue' }}>Create Store Profile</Text>
            <Text className="text-xs text-black/40 text-center">Set up your boutique's branding and location details</Text>
        </View>

        <View className="mb-12">
            <Text className="text-[10px] font-bold uppercase tracking-[1px] mb-6">Shop Information</Text>
            
            <View className="flex-row items-center mb-10">
                <TouchableOpacity 
                    onPress={() => pickImage(setLogo)}
                    className="w-24 h-24 border border-dashed border-gray-300 items-center justify-center bg-gray-50"
                >
                    {logo ? (
                        <Image source={{ uri: logo }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <Feather name="upload" size={24} color="gray" />
                    )}
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => pickImage(setLogo)}
                    className="ml-6 border border-black px-6 py-3"
                >
                    <Text className="text-[10px] font-bold uppercase">Upload Logo</Text>
                </TouchableOpacity>
            </View>

            <View className="gap-8">
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-2">Shop Name *</Text>
                    <TextInput 
                        placeholder="Enter shop name"
                        className="text-sm font-light"
                        value={shopName}
                        onChangeText={setShopName}
                    />
                </View>
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-2">Business Shop Description *</Text>
                    <TextInput 
                        placeholder="Describe your boutique..."
                        multiline
                        className="text-sm font-light min-h-[60px]"
                        value={shopDescription}
                        onChangeText={setShopDescription}
                    />
                    <Text className="text-[10px] text-black/20 text-right mt-2">{shopDescription.length}/500</Text>
                </View>
            </View>
        </View>

        <View className="flex-row gap-4 mt-auto">
            <TouchableOpacity onPress={() => setStep('plan')} className="flex-1 border border-gray-200 py-4 items-center">
                <Text className="text-[10px] font-bold uppercase">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={() => setStep('owner_info')} 
                className="flex-1 bg-black py-4 items-center"
            >
                <Text className="text-white text-[10px] font-bold uppercase">Continue</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  const renderStepOwnerInfo = () => (
    <View className="flex-1">
        {renderProgressBar('2/3')}
        
        <View className="items-center mb-10">
            <View className="bg-gray-50 p-4 mb-4">
                <Text className="font-bold text-xs uppercase tracking-[2px]">Logo Icon</Text>
            </View>
            <Text className="text-2xl text-center mb-2" style={{ fontFamily: 'Helvetica Neue' }}>Create Store Profile</Text>
            <Text className="text-xs text-black/40 text-center">Set up your boutique's branding and location details</Text>
        </View>

        <View className="mb-10">
            <Text className="text-[10px] font-bold uppercase tracking-[1px] mb-6">Owner Personal Information</Text>
            
            <View className="flex-row items-center mb-10">
                <TouchableOpacity 
                    onPress={() => pickImage(setOwnerImage)}
                    className="w-20 h-20 border border-dashed border-gray-300 items-center justify-center bg-gray-50"
                >
                    {ownerImage ? (
                        <Image source={{ uri: ownerImage }} style={{ width: '100%', height: '100%' }} />
                    ) : (
                        <Feather name="upload" size={20} color="gray" />
                    )}
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => pickImage(setOwnerImage)}
                    className="ml-6 border border-black px-6 py-3"
                >
                    <Text className="text-[10px] font-bold uppercase">Upload Image</Text>
                </TouchableOpacity>
            </View>

            <View className="gap-6">
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Owner Name *</Text>
                    <TextInput className="text-sm font-light" value={ownerName} onChangeText={setOwnerName} />
                </View>
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Email *</Text>
                    <TextInput className="text-sm font-light" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
                </View>
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Primary Phone Number *</Text>
                    <TextInput className="text-sm font-light" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
                </View>
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Full Address *</Text>
                    <TextInput className="text-sm font-light" value={address} onChangeText={setAddress} />
                </View>
                <View className="border-b border-gray-200 pb-2 relative">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Password *</Text>
                    <TextInput secureTextEntry={!showPassword} className="text-sm font-light pr-10" value={password} onChangeText={setPassword} />
                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="absolute right-0 bottom-2">
                        <Ionicons name={showPassword ? "eye-off" : "eye"} size={16} color="gray" />
                    </TouchableOpacity>
                </View>
                <View className="border-b border-gray-200 pb-2">
                    <Text className="text-[10px] text-black/40 uppercase mb-1">Confirm Password *</Text>
                    <TextInput secureTextEntry={!showPassword} className="text-sm font-light" value={confirmPassword} onChangeText={setConfirmPassword} />
                </View>
            </View>
        </View>

        <View className="flex-row gap-4 mt-8 pb-10">
            <TouchableOpacity onPress={() => setStep('shop_info')} className="flex-1 border border-gray-200 py-4 items-center">
                <Text className="text-[10px] font-bold uppercase">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={() => setStep('store_photos')} 
                className="flex-1 bg-black py-4 items-center"
            >
                <Text className="text-white text-[10px] font-bold uppercase">Continue</Text>
            </TouchableOpacity>
        </View>
    </View>
  );

  const renderStepPhotos = () => (
    <View className="flex-1">
        {renderProgressBar('3/3')}
        
        <View className="items-center mb-10">
            <View className="bg-gray-50 p-4 mb-4">
                <Text className="font-bold text-xs uppercase tracking-[2px]">Logo Icon</Text>
            </View>
            <Text className="text-2xl text-center mb-2" style={{ fontFamily: 'Helvetica Neue' }}>Create Store Profile</Text>
            <Text className="text-xs text-black/40 text-center">Set up your boutique's branding and location details</Text>
        </View>

        <View className="mb-10 flex-1">
            <Text className="text-[10px] font-bold uppercase tracking-[1px] mb-8">Upload Store Photos</Text>
            
            <View className="mb-10">
                <Text className="text-[10px] font-bold mb-4">Upload Front Store Image *</Text>
                <View className="p-4 border border-gray-200 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                        <TouchableOpacity 
                            onPress={() => pickImage(setFrontImage)}
                            className="w-16 h-16 border border-dashed border-gray-300 items-center justify-center bg-gray-50 mr-4"
                        >
                            {frontImage ? (
                                <Image source={{ uri: frontImage }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <Feather name="upload" size={20} color="gray" />
                            )}
                        </TouchableOpacity>
                        <View>
                            <Text className="text-[10px] font-bold mb-1">Tap To Upload</Text>
                            <Text className="text-[10px] text-black/30">JPG, PNG or PDF (max 5MB)</Text>
                        </View>
                    </View>
                    <TouchableOpacity 
                        onPress={() => pickImage(setFrontImage)}
                        className="bg-black px-6 py-3"
                    >
                        <Text className="text-white text-[10px] font-bold uppercase">Upload</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View className="mb-10">
                <Text className="text-[10px] font-bold mb-4">Upload Inside Store Image *</Text>
                <View className="p-4 border border-gray-200 flex-row items-center justify-between">
                    <View className="flex-row items-center flex-1">
                        <TouchableOpacity 
                            onPress={() => pickImage(setInsideImage)}
                            className="w-16 h-16 border border-dashed border-gray-300 items-center justify-center bg-gray-50 mr-4"
                        >
                            {insideImage ? (
                                <Image source={{ uri: insideImage }} style={{ width: '100%', height: '100%' }} />
                            ) : (
                                <Feather name="upload" size={20} color="gray" />
                            )}
                        </TouchableOpacity>
                        <View>
                            <Text className="text-[10px] font-bold mb-1">Tap To Upload</Text>
                            <Text className="text-[10px] text-black/30">JPG, PNG or PDF (max 5MB)</Text>
                        </View>
                    </View>
                    <TouchableOpacity 
                        onPress={() => pickImage(setInsideImage)}
                        className="bg-black px-6 py-3"
                    >
                        <Text className="text-white text-[10px] font-bold uppercase">Upload</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>

        <View className="flex-row gap-4 mt-auto mb-10">
            <TouchableOpacity onPress={() => setStep('owner_info')} className="flex-1 border border-gray-200 py-4 items-center">
                <Text className="text-[10px] font-bold uppercase">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity 
                onPress={handleFinalSignup} 
                disabled={loading}
                className="flex-1 bg-black py-4 items-center justify-center"
            >
                {loading ? <ActivityIndicator color="white" size="small" /> : <Text className="text-white text-[10px] font-bold uppercase">Finish</Text>}
            </TouchableOpacity>
        </View>
    </View>
  );

  return (
    <View className="flex-1 bg-white">
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <SafeAreaView className="flex-1 px-8 pt-4 pb-10" style={{ paddingTop: insets.top }}>
            {step === 'plan' && renderStepPlan()}
            {step === 'shop_info' && renderStepShopInfo()}
            {step === 'owner_info' && renderStepOwnerInfo()}
            {step === 'store_photos' && renderStepPhotos()}
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
