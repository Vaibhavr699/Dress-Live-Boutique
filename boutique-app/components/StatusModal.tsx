import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

export type StatusTone = 'success' | 'error' | 'info';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  tone?: StatusTone;
  /** Auto-dismiss after this many ms (success/info only). 0 disables. */
  autoDismissMs?: number;
};

const TONE_CONFIG: Record<
  StatusTone,
  { icon: keyof typeof Ionicons.glyphMap; chipBg: string; accent: string }
> = {
  success: { icon: 'checkmark', chipBg: '#EEF8EF', accent: '#2E7D43' },
  error: { icon: 'close', chipBg: '#FEF1ED', accent: '#C9491A' },
  info: { icon: 'information', chipBg: '#F2F2F2', accent: '#1A1A1A' },
};

/**
 * On-brand status pop-up used in place of the native OS Alert for things like
 * "Booking accepted". Matches FigmaConfirmModal's design language (blur
 * backdrop, bordered white card, square icon chip) so the accept/reject flow
 * feels part of the app instead of a raw system dialog. Success/info auto-
 * dismiss; tapping the backdrop or the button closes it immediately.
 */
export function StatusModal({
  visible,
  onClose,
  title,
  message,
  tone = 'success',
  autoDismissMs = 1800,
}: Props) {
  const cfg = TONE_CONFIG[tone];

  useEffect(() => {
    if (!visible || tone === 'error' || autoDismissMs <= 0) return;
    const t = setTimeout(onClose, autoDismissMs);
    return () => clearTimeout(t);
  }, [visible, tone, autoDismissMs, onClose]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-center px-8" onPress={onClose}>
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFillObject}>
          <BlurView intensity={18} tint="light" style={StyleSheet.absoluteFillObject} />
          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)' }} />
        </Animated.View>

        <Animated.View
          entering={ZoomIn.springify().damping(16).stiffness(180)}
          exiting={FadeOut.duration(120)}
        >
          <Pressable
            className="bg-white px-6 pt-7 pb-6"
            style={{ borderRadius: 2, borderWidth: 1, borderColor: '#000000' }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="items-center">
              <View
                className="items-center justify-center mb-4"
                style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: cfg.chipBg }}
              >
                <Ionicons name={cfg.icon} size={28} color={cfg.accent} />
              </View>

              <Text
                className="text-black text-center"
                style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 16, lineHeight: 20 }}
              >
                {title}
              </Text>

              {message ? (
                <Text
                  className="text-center mt-2"
                  style={{
                    color: 'rgba(0,0,0,0.55)',
                    fontFamily: 'Helvetica Neue',
                    fontWeight: '400',
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  {message}
                </Text>
              ) : null}

              {tone === 'error' ? (
                <Pressable
                  onPress={onClose}
                  className="bg-black py-3.5 items-center justify-center mt-6 w-full"
                  style={{ borderRadius: 2 }}
                >
                  <Text
                    className="text-white"
                    style={{ fontFamily: 'Helvetica Neue', fontWeight: '500', fontSize: 12, letterSpacing: 0.5 }}
                  >
                    OK
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
