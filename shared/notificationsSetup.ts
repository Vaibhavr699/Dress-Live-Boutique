import { Platform } from 'react-native';

/**
 * Boot-time notification configuration shared between the buyer (frontend-app)
 * and partner (boutique-app). Call `setupNotifications({ role })` once after
 * Notifications.requestPermissionsAsync resolves.
 *
 * Sets up:
 *   - Android: notification channels (bookings-high / reminders /
 *     recommendations / promotions). Each channel has its own importance,
 *     sound, vibration pattern. The user can mute any channel independently
 *     in Android system settings.
 *   - iOS: notification categories with inline action buttons that appear
 *     on the lock screen and notification center.
 *       'booking-request' (partner-only) → Accept / Decline
 *       'booking-update'  → View
 *
 * Failures are swallowed so a permission denial or expo-notifications hiccup
 * never breaks app boot. Caller is responsible for first asking for
 * notification permission.
 */
export type AppRole = 'buyer' | 'partner';

export async function setupNotifications({ role }: { role: AppRole }): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    if (Platform.OS === 'android') {
      await Promise.all([
        Notifications.setNotificationChannelAsync('bookings-high', {
          name: 'Bookings',
          description: 'Booking requests, accepts, reschedules, and cancellations.',
          importance: Notifications.AndroidImportance.HIGH,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          enableVibrate: true,
          enableLights: true,
          lightColor: '#1A1A1A',
          showBadge: true,
        }),
        Notifications.setNotificationChannelAsync('video-call', {
          name: 'Video calls',
          description: 'Incoming video calls and call-status updates.',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
          // Phone-call cadence: 1 s buzz, ~0.6 s rest, repeated. Falls through
          // Do Not Disturb (MAX importance) the same way a real call would.
          vibrationPattern: [0, 1000, 600, 1000, 600, 1000],
          enableVibrate: true,
          enableLights: true,
          lightColor: '#FF3B30',
          showBadge: true,
        }),
        Notifications.setNotificationChannelAsync('reminders', {
          name: 'Reminders',
          description: 'Reminders for upcoming bookings.',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
          vibrationPattern: [0, 200, 100, 200],
          enableVibrate: true,
          showBadge: true,
        }),
        Notifications.setNotificationChannelAsync('recommendations', {
          name: 'Recommendations',
          description: 'New dresses you might like and personalised picks.',
          importance: Notifications.AndroidImportance.LOW,
          sound: null,
          enableVibrate: false,
          showBadge: false,
        }),
        Notifications.setNotificationChannelAsync('promotions', {
          name: 'Promotions',
          description: 'Sales, discounts, and marketing messages.',
          importance: Notifications.AndroidImportance.MIN,
          sound: null,
          enableVibrate: false,
          showBadge: false,
        }),
      ]);
    }

    if (Platform.OS === 'ios') {
      // Inline action buttons that appear on the lock screen / notification
      // center. Tapping them fires a NotificationResponseReceivedListener
      // event with `actionIdentifier`. The buyer side gets a single "View"
      // button; the partner side also gets Accept / Decline for incoming
      // booking requests.
      await Notifications.setNotificationCategoryAsync(
        'booking-update',
        [
          {
            identifier: 'view',
            buttonTitle: 'View',
            options: { opensAppToForeground: true },
          },
        ]
      );

      if (role === 'partner') {
        await Notifications.setNotificationCategoryAsync(
          'booking-request',
          [
            {
              identifier: 'accept',
              buttonTitle: 'Accept',
              options: { opensAppToForeground: false, isAuthenticationRequired: false },
            },
            {
              identifier: 'decline',
              buttonTitle: 'Decline',
              options: { opensAppToForeground: false, isDestructive: true },
            },
          ]
        );
      } else {
        // For the buyer, treat booking-request the same as booking-update
        // (a single "View" button is enough). Registering the category
        // anyway means inbound pushes with categoryId='booking-request'
        // don't lose the View action on buyer phones.
        await Notifications.setNotificationCategoryAsync(
          'booking-request',
          [
            {
              identifier: 'view',
              buttonTitle: 'View',
              options: { opensAppToForeground: true },
            },
          ]
        );
      }
    }
  } catch {
    // Best-effort. The app keeps running even if channel/category setup fails.
  }
}
