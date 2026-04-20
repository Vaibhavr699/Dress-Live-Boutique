import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  tone?: 'danger' | 'default';
  leftButtonText: string;
  onLeftPress: () => void;
  rightButtonText: string;
  onRightPress: () => void;
};

export function FigmaConfirmModal({
  visible,
  onClose,
  title,
  description,
  iconName = 'trash',
  tone = 'danger',
  leftButtonText,
  onLeftPress,
  rightButtonText,
  onRightPress,
}: Props) {
  const danger = tone === 'danger';
  const accentText = danger ? '#C9491A' : '#1A1A1A';
  const iconBg = danger ? '#FDEEEE' : '#F2F2F2';

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
              style={{ width: 52, height: 52, borderRadius: 2, backgroundColor: iconBg }}
            >
              <Ionicons name={iconName} size={22} color={accentText} />
            </View>

            <Text className="text-[16px] text-black text-center" style={{ fontFamily: 'Helvetica Neue', fontWeight: '600' }}>
              {title}
            </Text>
            <Text
              className="text-[12px] text-center mt-3"
              style={{ color: accentText, lineHeight: 18 }}
            >
              {description}
            </Text>

            <View className="flex-row mt-6 w-full">
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onLeftPress}
                className="flex-1 border border-black py-4 items-center justify-center mr-2"
              >
                <Text className="text-[12px] text-black" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                  {leftButtonText}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onRightPress}
                className="flex-1 bg-black py-4 items-center justify-center ml-2"
              >
                <Text className="text-[12px] text-white" style={{ fontFamily: 'Helvetica Neue', fontWeight: '500' }}>
                  {rightButtonText}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

