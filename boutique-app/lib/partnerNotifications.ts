import { Platform } from 'react-native';
import Constants from 'expo-constants';

import type { NotificationItem } from '@/store/useNotificationStore';

type PartnerBookingNotificationInput = {
  id: number;
  appointment_type: 'video' | 'in_store';
  status: 'requested' | 'accepted' | 'rejected' | 'rescheduled' | 'completed';
  scheduled_for: string;
  location?: string | null;
  customer?: { full_name?: string | null; email?: string | null } | null;
  boutique?: { location?: string | null } | null;
};

function canUseLocalNotifications() {
  return Platform.OS !== 'web' && Constants.appOwnership !== 'expo';
}

function appointmentTypeLabel(type: 'video' | 'in_store') {
  return type === 'video' ? 'video call' : 'store visit';
}

function customerLabel(booking: PartnerBookingNotificationInput) {
  return booking.customer?.full_name?.trim() || booking.customer?.email?.trim() || 'Customer';
}

export function parseScheduledForToDate(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const match = value.match(/^[A-Za-z]+,\s*(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthShort = match[2].toLowerCase();
  const hour12 = Number(match[3]);
  const minute = Number(match[4]);
  const suffix = match[5].toUpperCase();
  const monthIndex = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthShort);
  if (monthIndex < 0) return null;
  let hour24 = hour12 % 12;
  if (suffix === 'PM') hour24 += 12;
  const now = new Date();
  let year = now.getFullYear();
  let date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  if (date.getTime() < now.getTime() - 1000 * 60 * 60 * 24 * 30) {
    year += 1;
    date = new Date(year, monthIndex, day, hour24, minute, 0, 0);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildPartnerBookingNotificationDetails(
  booking: PartnerBookingNotificationInput,
  kind: NonNullable<NotificationItem['kind']>
): Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'> {
  const typeLabel = appointmentTypeLabel(booking.appointment_type);
  const customerName = customerLabel(booking);
  const location = booking.location || booking.boutique?.location || null;

  if (kind === 'booking_requested') {
    return {
      externalKey: `partner-booking-requested-${booking.id}-${booking.scheduled_for}`,
      kind,
      title: `New ${typeLabel} request`,
      body: `${customerName} requested a ${typeLabel}.`,
      appointmentType: booking.appointment_type,
      scheduledFor: booking.scheduled_for,
      location,
      customerName,
      status: booking.status,
      action: { type: 'booking', bookingId: booking.id },
    };
  }

  if (kind === 'booking_updated') {
    return {
      externalKey: `partner-booking-updated-${booking.id}-${booking.scheduled_for}-${booking.status}`,
      kind,
      title: `Booking updated`,
      body: `${customerName}'s ${typeLabel} was updated.`,
      appointmentType: booking.appointment_type,
      scheduledFor: booking.scheduled_for,
      location,
      customerName,
      status: booking.status,
      action: { type: 'booking', bookingId: booking.id },
    };
  }

  if (kind === 'booking_cancelled') {
    return {
      externalKey: `partner-booking-cancelled-${booking.id}`,
      kind,
      title: `Booking cancelled`,
      body: `${customerName}'s ${typeLabel} was cancelled.`,
      appointmentType: booking.appointment_type,
      scheduledFor: booking.scheduled_for,
      location,
      customerName,
      status: booking.status,
      action: { type: 'booking', bookingId: booking.id },
    };
  }

  if (kind === 'booking_reminder') {
    return {
      externalKey: `partner-booking-reminder-${booking.id}-${booking.scheduled_for}`,
      kind,
      title: booking.appointment_type === 'video' ? 'Upcoming video call' : 'Upcoming store visit',
      body: `${customerName}'s ${typeLabel} starts soon.`,
      appointmentType: booking.appointment_type,
      scheduledFor: booking.scheduled_for,
      location,
      customerName,
      status: booking.status,
      action: { type: 'booking', bookingId: booking.id },
    };
  }

  return {
    externalKey: `partner-booking-upcoming-${booking.id}`,
    kind: 'booking_upcoming',
    title: booking.appointment_type === 'video' ? 'Upcoming video call' : 'Upcoming store visit',
    body: `Track ${customerName}'s next ${typeLabel}.`,
    appointmentType: booking.appointment_type,
    scheduledFor: booking.scheduled_for,
    location,
    customerName,
    status: booking.status,
    action: { type: 'booking', bookingId: booking.id },
  };
}

export async function sendLocalPhoneNotification(
  notification: Omit<NotificationItem, 'id' | 'createdAt' | 'readAt'>
) {
  if (!canUseLocalNotifications()) return;
  try {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body ?? '',
        data: {
          bookingId: notification.action?.bookingId ?? null,
          type: notification.action?.type ?? null,
          notificationKind: notification.kind ?? null,
          scheduledFor: notification.scheduledFor ?? null,
          status: notification.status ?? null,
        },
      },
      trigger: null,
    });
  } catch {
      // ignore local notification failures
  }
}

export async function syncScheduledBookingReminder(booking: PartnerBookingNotificationInput) {
  if (!canUseLocalNotifications()) return;
  if (!['requested', 'accepted', 'rescheduled'].includes(booking.status)) return;
  const bookingDate = parseScheduledForToDate(booking.scheduled_for);
  if (!bookingDate) return;
  const reminderAt = new Date(bookingDate.getTime() - 30 * 60 * 1000);
  if (reminderAt.getTime() <= Date.now()) return;

  try {
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const reminderKey = `partner-booking-reminder-${booking.id}-${booking.scheduled_for}`;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const existing = scheduled.find((item) => item.content?.data && (item.content.data as any)?.reminderKey === reminderKey);
    if (existing) return;
    const payload = buildPartnerBookingNotificationDetails(booking, 'booking_reminder');
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: `${payload.body ?? ''}${payload.scheduledFor ? ` ${payload.scheduledFor}` : ''}`.trim(),
        data: {
          reminderKey,
          bookingId: booking.id,
          type: 'booking',
          scheduledFor: booking.scheduled_for,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderAt,
      },
    });
  } catch {
    // ignore reminder failures
  }
}
