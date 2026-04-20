import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  buttonText: string;
  onButtonPress: () => void;
};

export function FigmaSuccessModal({
  visible,
  onClose,
  title,
  description,
  buttonText,
  onButtonPress,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/25 justify-center px-7" onPress={onClose}>
        <Pressable
          className="bg-white p-6"
          style={{ borderRadius: 2 }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center">
            <View
              className="items-center justify-center mb-4"
              style={{ width: 52, height: 52, borderRadius: 2, backgroundColor: '#EEF8EE' }}
            >
              <Ionicons name="checkmark" size={22} color="#1A1A1A" />
            </View>

            <Text className="text-[16px] text-black text-center" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
              {title}
            </Text>
            <Text className="text-[12px] text-black/60 text-center mt-3" style={{ lineHeight: 18 }}>
              {description}
            </Text>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={onButtonPress}
              className="bg-black py-4 items-center justify-center w-full mt-6"
            >
              <Text className="text-[12px] text-white" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                {buttonText}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

