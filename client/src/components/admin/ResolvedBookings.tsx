import type { Booking } from "../../types";
import { BookingTable } from "./BookingTable";

type ResolvedBookingsProps = {
  bookings: Booking[];
  busyBookingId?: string;
  hasActiveFilters?: boolean;
  mode?: "resolved" | "canceled";
  onReopen: (bookingId: string) => void;
  onDelete: (bookingId: string, customerName: string) => void;
  onResetFilters?: () => void;
};

export function ResolvedBookings({
  bookings,
  busyBookingId,
  hasActiveFilters,
  mode = "resolved",
  onReopen,
  onDelete,
  onResetFilters
}: ResolvedBookingsProps) {
  return (
    <section className="admin-table-section">
      <BookingTable
        bookings={bookings}
        emptyMessage={mode === "canceled" ? "No canceled bookings yet." : "No resolved bookings yet."}
        mode={mode}
        busyBookingId={busyBookingId}
        hasActiveFilters={hasActiveFilters}
        onReopen={onReopen}
        onDelete={onDelete}
        onResetFilters={onResetFilters}
      />
    </section>
  );
}
