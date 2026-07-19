import type { Booking } from "../../types";
import { BookingTable } from "./BookingTable";

type ActiveBookingsProps = {
  bookings: Booking[];
  busyBookingId?: string;
  hasActiveFilters?: boolean;
  onResolve: (bookingId: string) => void;
  onDelete: (bookingId: string, customerName: string) => void;
  onResetFilters?: () => void;
};

export function ActiveBookings({
  bookings,
  busyBookingId,
  hasActiveFilters,
  onResolve,
  onDelete,
  onResetFilters
}: ActiveBookingsProps) {
  return (
    <section className="admin-table-section">
      <BookingTable
        bookings={bookings}
        emptyMessage="No active bookings in this queue."
        mode="active"
        busyBookingId={busyBookingId}
        hasActiveFilters={hasActiveFilters}
        onResolve={onResolve}
        onDelete={onDelete}
        onResetFilters={onResetFilters}
      />
    </section>
  );
}
