import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';

type FadeInViewProps = {
  children: React.ReactNode;
  duration?: number;
  delay?: number;
  withTranslate?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
};

const EASE_OUT = Easing.out(Easing.cubic);

export function FadeInView({
  children,
  duration = 260,
  delay = 0,
  withTranslate = true,
  style,
  className,
}: FadeInViewProps) {
  const entering = withTranslate
    ? FadeInDown.duration(duration).delay(delay).easing(EASE_OUT).withInitialValues({
        transform: [{ translateY: 6 }],
      })
    : FadeIn.duration(duration).delay(delay).easing(EASE_OUT);

  return (
    <Animated.View entering={entering} style={style} className={className}>
      {children}
    </Animated.View>
  );
}
