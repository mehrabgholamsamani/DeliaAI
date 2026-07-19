CREATE TYPE "BookingStatus" AS ENUM ('OPEN', 'CANCELED', 'COMPLETED');
CREATE TYPE "AvailabilityStatus" AS ENUM ('OPEN', 'BUSY');

CREATE TABLE "BusinessSettings" (
  "id" TEXT NOT NULL DEFAULT 'default', "businessName" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Berlin', "operatingWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  "slotStartHours" INTEGER[] NOT NULL DEFAULT ARRAY[9,10,11,13,14,15,16], "slotDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  "bookingPaused" BOOLEAN NOT NULL DEFAULT false, "bookingPauseMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Service" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT NOT NULL,
  "priceLabel" TEXT NOT NULL, "durationMinutes" INTEGER NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Service_slug_key" ON "Service"("slug");

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "phone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

CREATE TABLE "Booking" (
  "id" TEXT NOT NULL, "customerId" TEXT NOT NULL, "serviceId" TEXT NOT NULL, "appointmentAt" TIMESTAMP(3) NOT NULL,
  "appointmentEndAt" TIMESTAMP(3) NOT NULL, "status" "BookingStatus" NOT NULL DEFAULT 'OPEN', "notes" TEXT,
  "managementTokenHash" TEXT, "managementTokenExpiry" TIMESTAMP(3), "canceledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Booking_managementTokenHash_key" ON "Booking"("managementTokenHash");
CREATE INDEX "Booking_status_appointmentAt_appointmentEndAt_idx" ON "Booking"("status", "appointmentAt", "appointmentEndAt");
CREATE INDEX "Booking_customerId_createdAt_idx" ON "Booking"("customerId", "createdAt");

CREATE TABLE "AvailabilityOverride" (
  "id" TEXT NOT NULL, "slotStartAt" TIMESTAMP(3) NOT NULL, "status" "AvailabilityStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvailabilityOverride_slotStartAt_key" ON "AvailabilityOverride"("slotStartAt");

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'admin',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL, "action" TEXT NOT NULL, "targetType" TEXT NOT NULL, "targetId" TEXT,
  "actorType" TEXT NOT NULL, "actorId" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
