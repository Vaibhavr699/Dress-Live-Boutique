import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
    // Hook a crash reporter here when wired (Sentry/Bugsnag/Crashlytics)
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        <Text
          style={{
            color: '#111111',
            fontSize: 14,
            fontWeight: '700',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Something went wrong
        </Text>
        <Text
          style={{
            color: '#6E6E6E',
            fontSize: 12,
            lineHeight: 18,
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          The app hit an unexpected error. Tap below to try again.
        </Text>
        <TouchableOpacity
          onPress={this.reset}
          activeOpacity={0.85}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 32,
            backgroundColor: '#111111',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Reload
          </Text>
        </TouchableOpacity>
      </View>
    );
  }
}
