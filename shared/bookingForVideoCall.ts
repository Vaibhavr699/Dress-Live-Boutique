/** Subset of `GET /bookings/{id}` used by video call screens. */

export type VideoCallBookingDress = {
  id: number;
  name: string;
  price?: number;
  colors?: string | null;
  sizes?: string | null;
  image_url?: string | null;
};

export type VideoCallBookingPayload = {
  id: number;
  appointment_type: string;
  dresses: VideoCallBookingDress[];
};
