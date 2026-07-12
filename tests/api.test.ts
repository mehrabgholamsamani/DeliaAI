import mongoose from "mongoose";
import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

dotenv.config();

let app: Awaited<ReturnType<typeof import("../server/src/app.js").createApp>>;
let memoryServer: MongoMemoryServer | undefined;
const sendMailMock = vi.fn().mockResolvedValue({});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: sendMailMock
    })
  }
}));

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PORT = "4101";
  if (process.env.TEST_MONGODB_URL) {
    process.env.MONGODB_URL = process.env.TEST_MONGODB_URL;
  } else if (process.env.CI === "true") {
    process.env.MONGODB_URL = "mongodb://127.0.0.1:27017/booking_api_test";
  } else {
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: `booking_api_test_${Date.now()}`
      }
    });
    process.env.MONGODB_URL = memoryServer.getUri();
  }
  process.env.MONGODB_DB_NAME = `booking_api_test_${Date.now()}`;
  process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS = "30000";
  process.env.MONGODB_CONNECT_TIMEOUT_MS = "30000";
  process.env.APP_BASE_URL = "http://localhost:5173";
  process.env.CLIENT_ORIGIN = "http://localhost:5173";
  process.env.BUSINESS_TIMEZONE = "Europe/Helsinki";
  process.env.BUSINESS_OWNER_EMAIL = "owner@localhost.test";
  process.env.ADMIN_SESSION_SECRET = "test-admin-session-secret-minimum-32-characters";
  process.env.ADMIN_SESSION_VERSION = "1";
  process.env.ADMIN_PASSWORD_HASH =
    "$2b$12$ZS3Qird.jdD13D/0Y.7KPe/DeFEpD/pRdODc9eapK7vciB1/u3rvG";
  process.env.MONITOR_SESSION_SECRET = "test-monitor-session-secret-minimum-32-characters";
  process.env.MONITOR_SESSION_VERSION = "1";
  process.env.MONITOR_PASSWORD_HASH =
    "$2b$12$ZS3Qird.jdD13D/0Y.7KPe/DeFEpD/pRdODc9eapK7vciB1/u3rvG";
  process.env.MONITOR_MFA_ENABLED = "false";
  process.env.MONITOR_MFA_CODE_TTL_MINUTES = "10";
  process.env.MONITOR_MFA_MAX_ATTEMPTS = "5";
  process.env.API_RATE_LIMIT_MAX = "10000";
  process.env.BOOKING_RATE_LIMIT_MAX = "10000";
  process.env.MAGIC_LINK_RATE_LIMIT_MAX = "10000";
  process.env.ADMIN_LOGIN_RATE_LIMIT_MAX = "10000";
  process.env.ADMIN_MUTATION_RATE_LIMIT_MAX = "10000";

  const [{ createApp }, { connectDatabase }] = await Promise.all([
    import("../server/src/app.js"),
    import("../server/src/db.js")
  ]);

  await connectDatabase();
  app = createApp();
}, 60_000);

afterAll(async () => {
  if (mongoose.connection.db) {
    const { dropSafeTestDatabase } = await import("../server/src/db.js");
    await dropSafeTestDatabase();
  }

  await mongoose.disconnect();
  await memoryServer?.stop();
}, 60_000);

async function getAdminCsrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get("/api/admin/csrf").expect(200);

  return response.body.csrfToken as string;
}

async function getMonitorCsrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get("/api/monitor/csrf").expect(200);

  return response.body.csrfToken as string;
}

function futureBusinessDate(operatingDayOffset: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 30);

  let remainingOperatingDays = operatingDayOffset;

  while (true) {
    const weekday = date.getUTCDay();

    if (weekday >= 1 && weekday <= 5) {
      if (remainingOperatingDays === 0) {
        return date.toISOString().slice(0, 10);
      }

      remainingOperatingDays -= 1;
    }

    date.setUTCDate(date.getUTCDate() + 1);
  }
}

describe("API", () => {
  it("returns health status", async () => {
    await request(app).get("/api/health").expect(200, { status: "ok" });
    await request(app).get("/api/ready").expect(200, { status: "ready", database: "ok" });
  });

  it("creates default business settings and returns services", async () => {
    const response = await request(app).get("/api/services").expect(200);

    expect(response.body.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "standard-home",
          name: "Standard Service Visit"
        })
      ])
    );

    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    const settingsResponse = await agent.get("/api/business-settings").expect(200);

    expect(settingsResponse.body.settings.ownerEmail).toBe("owner@localhost.test");
  });

  it("protects admin booking data until login", async () => {
    await request(app).get("/api/bookings?status=all").expect(401);
    await request(app).get("/api/admin/metrics").expect(401);

    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    await agent.get("/api/bookings?status=all").expect(200);
    await agent.get("/api/admin/metrics").expect(200);
    await agent.get("/api/monitor/dashboard").expect(401);
    await agent.post("/api/admin/logout").expect(403);
    await agent
      .post("/api/admin/logout")
      .set("x-csrf-token", await getAdminCsrf(agent))
      .expect(204);
    await agent.get("/api/bookings?status=all").expect(401);
  });

  it("keeps monitoring separate from business owner admin access", async () => {
    await request(app).get("/api/monitor/dashboard").expect(401);

    const adminAgent = request.agent(app);
    await adminAgent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    await adminAgent.get("/api/monitor/dashboard").expect(401);

    const monitorAgent = request.agent(app);
    await monitorAgent.post("/api/monitor/login").send({ password: "admin1234" }).expect(200);
    await monitorAgent.get("/api/bookings?status=all").expect(401);
    await monitorAgent
      .get("/api/monitor/dashboard")
      .expect(200)
      .expect((response) => {
        expect(response.body.status.api).toBe("online");
        expect(response.body.status.database).toBe("ready");
        expect(response.body.bookings).toEqual(
          expect.objectContaining({
            total: expect.any(Number),
            recent: expect.any(Array)
          })
        );
        expect(response.body.emails).toEqual(
          expect.objectContaining({
            queued: expect.any(Number),
            failed: expect.any(Number),
            staleJobs: expect.any(Array)
          })
        );
        expect(response.body.release).toEqual(
          expect.objectContaining({
            version: expect.any(String),
            nodeVersion: expect.any(String)
          })
        );
        expect(response.body.database).toEqual(
          expect.objectContaining({
            available: expect.any(Boolean),
            collections: expect.any(Number)
          })
        );
        expect(response.body.frontend).toEqual(
          expect.objectContaining({
            recentEvents: expect.any(Array)
          })
        );
        expect(response.body.syntheticChecks).toEqual(expect.any(Array));
        expect(response.body.trends.requests).toEqual(expect.any(Array));
        expect(response.body.recentErrors).toEqual(expect.any(Array));
      });

    await monitorAgent.post("/api/monitor/logout").expect(403);
    await monitorAgent
      .post("/api/monitor/logout")
      .set("x-csrf-token", await getMonitorCsrf(monitorAgent))
      .expect(204);
    await monitorAgent.get("/api/monitor/dashboard").expect(401);
  });

  it("requires an emailed code before creating a monitor session when MFA is enabled", async () => {
    try {
      process.env.MONITOR_MFA_ENABLED = "true";
      process.env.ALERT_EMAIL_TO = "operator@localhost.test";
      sendMailMock.mockClear();
      vi.resetModules();
      const { createApp } = await import("../server/src/app.js");
      const mfaApp = createApp();
      const monitorAgent = request.agent(mfaApp);
      const loginResponse = await monitorAgent
        .post("/api/monitor/login")
        .send({ password: "admin1234" })
        .expect(200);

      expect(loginResponse.body).toEqual(
        expect.objectContaining({
          authenticated: false,
          mfaRequired: true,
          challengeId: expect.any(String)
        })
      );
      await monitorAgent.get("/api/monitor/dashboard").expect(401);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      const sentText = String(sendMailMock.mock.calls[0]?.[0]?.text || "");
      const code = sentText.match(/Code: (\d{6})/)?.[1];

      expect(code).toMatch(/^\d{6}$/);

      await monitorAgent
        .post("/api/monitor/login/verify")
        .send({ challengeId: loginResponse.body.challengeId, code })
        .expect(200, { authenticated: true });
      await monitorAgent.get("/api/monitor/dashboard").expect(200);

      await request(mfaApp)
        .post("/api/monitor/login/verify")
        .send({ challengeId: loginResponse.body.challengeId, code })
        .expect(401);
    } finally {
      process.env.MONITOR_MFA_ENABLED = "false";
      process.env.ALERT_EMAIL_TO = "owner@localhost.test";
    }
  });

  it("does not expose monitor MFA codes when email delivery fails", async () => {
    try {
      process.env.MONITOR_MFA_ENABLED = "true";
      process.env.ALERT_EMAIL_TO = "operator@localhost.test";
      sendMailMock.mockRejectedValueOnce(new Error("SMTP unavailable"));
      vi.resetModules();
      const [{ createApp }, { MonitorLoginChallenge }] = await Promise.all([
        import("../server/src/app.js"),
        import("../server/src/models/MonitorLoginChallenge.js")
      ]);
      const mfaApp = createApp();
      const challengeCountBefore = await MonitorLoginChallenge.countDocuments();
      const response = await request(mfaApp)
        .post("/api/monitor/login")
        .send({ password: "admin1234" })
        .expect(503);

      expect(response.body).not.toHaveProperty("devCode");
      expect(response.body.error.code).toBe("MONITOR_MFA_EMAIL_FAILED");
      await expect(MonitorLoginChallenge.countDocuments()).resolves.toBe(challengeCountBefore);
    } finally {
      process.env.MONITOR_MFA_ENABLED = "false";
      process.env.ALERT_EMAIL_TO = "owner@localhost.test";
      sendMailMock.mockReset();
      sendMailMock.mockResolvedValue({});
    }
  });

  it("keeps admin authentication valid after app modules reload", async () => {
    const loginResponse = await request(app)
      .post("/api/admin/login")
      .send({ password: "admin1234" })
      .expect(200);
    const cookies = loginResponse.headers["set-cookie"];

    vi.resetModules();
    const { createApp } = await import("../server/src/app.js");
    const reloadedApp = createApp();

    await request(reloadedApp)
      .get("/api/admin/me")
      .set("Cookie", cookies)
      .expect(200, { authenticated: true });
  });

  it("revokes existing admin cookies when session version changes", async () => {
    const loginResponse = await request(app)
      .post("/api/admin/login")
      .send({ password: "admin1234" })
      .expect(200);
    const cookies = loginResponse.headers["set-cookie"];

    try {
      process.env.ADMIN_SESSION_VERSION = "2";
      vi.resetModules();
      const { createApp } = await import("../server/src/app.js");
      const reloadedApp = createApp();

      await request(reloadedApp)
        .get("/api/admin/me")
        .set("Cookie", cookies)
        .expect(200, { authenticated: false });
    } finally {
      process.env.ADMIN_SESSION_VERSION = "1";
      vi.resetModules();
    }
  });

  it("returns Helsinki availability labels and UTC slot values", async () => {
    const response = await request(app)
      .get("/api/availability?start=2026-06-08&days=1")
      .expect(200);
    const firstSlot = response.body.days[0].slots[0];

    expect(response.body.timezone).toBe("Europe/Helsinki");
    expect(response.body.days[0].dateLabel).toMatch(/(Jun.*8|8.*Jun)/);
    expect(firstSlot.timeLabel).toMatch(/8[:.]00.*10[:.]00/);
    expect(firstSlot.slotStartAt).toBe("2026-06-08T05:00:00.000Z");
  });

  it("creates a booking for an available slot and blocks admin-only availability changes without login", async () => {
    const date = futureBusinessDate(0);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;

    await request(app)
      .patch("/api/availability")
      .send({ slotStartAt, status: "busy" })
      .expect(401);

    const bookingResponse = await request(app)
      .post("/api/bookings")
      .send({
        name: "API Test Customer",
        email: "api-test@example.com",
        phone: "+358401234567",
        serviceId: "standard-home",
        appointmentAt: slotStartAt,
        notes: "Created by automated API test"
      })
      .expect(201);

    expect(bookingResponse.body.booking.appointmentAt).toBe(slotStartAt);
    expect(bookingResponse.body.booking.emailVerified).toBe(false);
    expect(bookingResponse.body.booking).not.toHaveProperty("verificationTokenHash");

    const nextAvailabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const bookedSlot = nextAvailabilityResponse.body.days[0].slots[0];

    expect(bookedSlot.status).toBe("booked");
    expect(bookedSlot.bookingId).toBe(bookingResponse.body.booking._id);
  });

  it("lets admin update business settings", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getAdminCsrf(agent);

    const response = await agent
      .patch("/api/business-settings")
      .set("x-csrf-token", csrfToken)
      .send({
        businessName: "Helsinki Booking Co",
        ownerEmail: "owner@example.com",
        notificationEmailFromName: "Helsinki Leads",
        slotStartHours: [9, 11, 13],
        slotDurationHours: 2
      })
      .expect(200);

    expect(response.body.settings.businessName).toBe("Helsinki Booking Co");
    expect(response.body.settings.ownerEmail).toBe("owner@example.com");
    expect(response.body.settings.notificationEmailFromName).toBe("Helsinki Leads");
    expect(response.body.settings.slotStartHours).toEqual([9, 11, 13]);
  });

  it("backfills missing business settings fields", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);

    await mongoose.connection.db?.collection("businesssettings").updateOne(
      { key: "default" },
      {
        $unset: {
          ownerEmail: "",
          notificationEmailFromName: ""
        }
      }
    );

    const response = await agent.get("/api/business-settings").expect(200);

    expect(response.body.settings.ownerEmail).toBe("owner@localhost.test");
    expect(response.body.settings.notificationEmailFromName).toBe("Booking Notifications");
  });

  it("prevents duplicate active bookings for the same slot", async () => {
    const date = futureBusinessDate(1);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;

    await request(app)
      .post("/api/bookings")
      .send({
        name: "First Slot Customer",
        email: "first-slot@example.com",
        phone: "+358401234568",
        serviceId: "standard-home",
        appointmentAt: slotStartAt,
        notes: "First duplicate slot test"
      })
      .expect(201);

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Second Slot Customer",
        email: "second-slot@example.com",
        phone: "+358401234569",
        serviceId: "standard-home",
        appointmentAt: slotStartAt,
        notes: "Second duplicate slot test"
      })
      .expect(409);
  });

  it("paginates admin booking lists", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);

    const response = await agent.get("/api/bookings?status=all&page=1&limit=1").expect(200);

    expect(response.body.bookings).toHaveLength(1);
    expect(response.body.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 1
      })
    );
    expect(response.body.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it("rejects appointment times that are not exact advertised slots", async () => {
    const date = futureBusinessDate(2);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;
    const shiftedSlotStartAt = new Date(
      new Date(slotStartAt).getTime() + 30 * 60 * 1000
    ).toISOString();

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Shifted Slot Customer",
        email: "shifted-slot@example.com",
        phone: "+358401234572",
        serviceId: "standard-home",
        appointmentAt: shiftedSlotStartAt,
        notes: "Non-exact slot test"
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.error.code).toBe("INVALID_APPOINTMENT_TIME");
      });
  });

  it("blocks bookings that overlap a longer service duration", async () => {
    const date = futureBusinessDate(3);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1&serviceId=deep-clean`)
      .expect(200);
    const firstSlot = availabilityResponse.body.days[0].slots[0].slotStartAt;
    const overlappingSlot = availabilityResponse.body.days[0].slots[1].slotStartAt;

    const bookingResponse = await request(app)
      .post("/api/bookings")
      .send({
        name: "Long Service Customer",
        email: "long-service@example.com",
        phone: "+358401234573",
        serviceId: "deep-clean",
        appointmentAt: firstSlot,
        notes: "Long service overlap test"
      })
      .expect(201);

    expect(bookingResponse.body.booking.serviceDurationHours).toBe(6);
    expect(bookingResponse.body.booking.appointmentEndAt).toBeDefined();

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Overlap Customer",
        email: "overlap@example.com",
        phone: "+358401234574",
        serviceId: "standard-home",
        appointmentAt: overlappingSlot,
        notes: "Should overlap the long service"
      })
      .expect(409);

    const standardAvailabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1&serviceId=standard-home`)
      .expect(200);

    expect(standardAvailabilityResponse.body.days[0].slots[1].status).toBe("booked");
  });

  it("prevents concurrent overlapping bookings with different start times", async () => {
    const date = futureBusinessDate(4);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1&serviceId=deep-clean`)
      .expect(200);
    const firstSlot = availabilityResponse.body.days[0].slots[0].slotStartAt;
    const overlappingSlot = availabilityResponse.body.days[0].slots[1].slotStartAt;

    const responses = await Promise.all([
      request(app)
        .post("/api/bookings")
        .send({
          name: "Concurrent Long Customer",
          email: "concurrent-long@example.com",
          phone: "+358401234577",
          serviceId: "deep-clean",
          appointmentAt: firstSlot,
          notes: "Concurrent long service"
        }),
      request(app)
        .post("/api/bookings")
        .send({
          name: "Concurrent Overlap Customer",
          email: "concurrent-overlap@example.com",
          phone: "+358401234578",
          serviceId: "standard-home",
          appointmentAt: overlappingSlot,
          notes: "Concurrent overlapping service"
        })
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      responses.find((response) => response.status === 409)?.body.error.code
    ).toBe("SLOT_BOOKED");
  });

  it("blocks long bookings that overlap admin busy slots", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getAdminCsrf(agent);

    const date = futureBusinessDate(5);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1&serviceId=deep-clean`)
      .expect(200);
    const firstSlot = availabilityResponse.body.days[0].slots[0].slotStartAt;
    const blockedInsideLongService = availabilityResponse.body.days[0].slots[1].slotStartAt;

    await agent
      .patch("/api/availability")
      .set("x-csrf-token", csrfToken)
      .send({ slotStartAt: blockedInsideLongService, status: "busy" })
      .expect(200);

    const updatedAvailabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1&serviceId=deep-clean`)
      .expect(200);

    expect(updatedAvailabilityResponse.body.days[0].slots[0].status).toBe("busy");

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Busy Overlap Customer",
        email: "busy-overlap@example.com",
        phone: "+358401234579",
        serviceId: "deep-clean",
        appointmentAt: firstSlot,
        notes: "Should overlap an admin busy slot"
      })
      .expect(409)
      .expect((response) => {
        expect(response.body.error.code).toBe("SLOT_BUSY");
      });
  });

  it("treats legacy bookings without status as active for slot availability", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getAdminCsrf(agent);
    const date = futureBusinessDate(6);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;

    await mongoose.connection.db?.collection("bookings").insertOne({
      name: "Legacy Slot Customer",
      email: "legacy-slot@example.com",
      phone: "+358401234570",
      serviceId: "standard-home",
      serviceName: "Standard Appointment",
      appointmentAt: new Date(slotStartAt),
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const bookedAvailabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);

    expect(bookedAvailabilityResponse.body.days[0].slots[0].status).toBe("booked");

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Blocked Legacy Slot Customer",
        email: "blocked-legacy-slot@example.com",
        phone: "+358401234571",
        serviceId: "standard-home",
        appointmentAt: slotStartAt,
        notes: "Legacy slot duplicate test"
      })
      .expect(409);

    await agent
      .patch("/api/availability")
      .set("x-csrf-token", csrfToken)
      .send({ slotStartAt, status: "busy" })
      .expect(409);
  });

  it("lets admin mark open availability busy after login", async () => {
    const agent = request.agent(app);
    await agent.post("/api/admin/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getAdminCsrf(agent);
    const date = futureBusinessDate(7);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${date}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;

    const response = await agent
      .patch("/api/availability")
      .set("x-csrf-token", csrfToken)
      .send({ slotStartAt, status: "busy" })
      .expect(200);

    expect(response.body.days[0].slots[0].status).toBe("busy");
  });

  it("lets monitor pause bookings, show operational status, and collect frontend telemetry", async () => {
    const monitorAgent = request.agent(app);
    await monitorAgent.post("/api/monitor/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getMonitorCsrf(monitorAgent);

    await request(app)
      .post("/api/telemetry/frontend")
      .send({
        type: "javascript_error",
        path: "/booking",
        message: "Synthetic browser error"
      })
      .expect(204);

    await monitorAgent
      .patch("/api/monitor/operational-controls")
      .set("x-csrf-token", csrfToken)
      .send({
        bookingsPaused: true,
        bookingPauseMessage: "Booking pause test",
        maintenanceBannerEnabled: true,
        maintenanceBannerMessage: "Maintenance banner test"
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.operationalControls.bookingsPaused).toBe(true);
      });

    await request(app)
      .get("/api/operational-status")
      .expect(200)
      .expect((response) => {
        expect(response.body.operationalControls.bookingsPaused).toBe(true);
        expect(response.body.operationalControls.maintenanceBannerEnabled).toBe(true);
      });

    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${futureBusinessDate(8)}&days=1`)
      .expect(200);

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Paused Booking Customer",
        email: "paused-booking@example.com",
        phone: "+358401234581",
        serviceId: "standard-home",
        appointmentAt: availabilityResponse.body.days[0].slots[0].slotStartAt
      })
      .expect(503)
      .expect((response) => {
        expect(response.body.error.code).toBe("BOOKINGS_PAUSED");
      });

    await monitorAgent
      .get("/api/monitor/dashboard")
      .expect(200)
      .expect((response) => {
        expect(response.body.frontend.eventsLast24Hours.javascript_error).toBeGreaterThanOrEqual(1);
        expect(response.body.operationalControls.bookingsPaused).toBe(true);
      });

    await monitorAgent
      .patch("/api/monitor/operational-controls")
      .set("x-csrf-token", csrfToken)
      .send({
        bookingsPaused: false,
        maintenanceBannerEnabled: false
      })
      .expect(200);
  });

  it("sends monitor alert emails for active incidents with cooldown", async () => {
    sendMailMock.mockClear();
    const [{ EmailJob }, { processMonitorAlerts }] = await Promise.all([
      import("../server/src/models/EmailJob.js"),
      import("../server/src/alerting.js")
    ]);

    await EmailJob.create({
      type: "ownerBookingNotice",
      status: "failed",
      idempotencyKey: `alert-failed-email:${Date.now()}`,
      payload: {
        to: "owner@localhost.test",
        businessName: "Service Booking Business",
        customerName: "Alert Customer",
        customerEmail: "alert@example.com",
        customerPhone: "+358401234582",
        serviceName: "Standard Service Visit",
        appointmentLabel: "Test appointment",
        adminUrl: "http://localhost:5173/admin"
      },
      runAt: new Date(),
      attempts: 5,
      maxAttempts: 5,
      lastError: "Alert test failure"
    });

    const firstSentAlerts = await processMonitorAlerts(new Date("2026-06-21T08:00:00.000Z"));
    const firstAlertSubjects = sendMailMock.mock.calls.map((call) => call[0]?.subject);

    expect(firstSentAlerts).toContain("failed-email-jobs");
    expect(firstAlertSubjects).toContain("[CRITICAL] Failed email jobs detected");

    sendMailMock.mockClear();
    const secondSentAlerts = await processMonitorAlerts(new Date("2026-06-21T08:05:00.000Z"));

    expect(secondSentAlerts).not.toContain("failed-email-jobs");
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("supports magic-link manage, edit, and cancel", async () => {
    const token = "test-manage-token-0123456789abcdef";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [{ Booking }, { getBusinessSettings }] = await Promise.all([
      import("../server/src/models/Booking.js"),
      import("../server/src/services.js")
    ]);
    const settings = await getBusinessSettings();
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${futureBusinessDate(9)}&days=1`)
      .expect(200);
    const firstSlot = availabilityResponse.body.days[0].slots[0].slotStartAt;
    const secondSlot = availabilityResponse.body.days[0].slots[1].slotStartAt;

    const booking = await Booking.create({
      name: "Magic Test",
      email: "magic-test@example.com",
      phone: "+358401234570",
      serviceId: settings.services[0].id,
      serviceName: settings.services[0].name,
      appointmentAt: new Date(firstSlot),
      status: "open",
      emailVerified: false,
      verificationTokenHash: tokenHash,
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      notes: "Magic link test"
    });

    const manageResponse = await request(app)
      .post("/api/bookings/manage")
      .send({ token })
      .expect(200);

    expect(manageResponse.body.booking._id).toBe(String(booking._id));
    expect(manageResponse.body.booking.emailVerified).toBe(true);
    expect(manageResponse.body.booking).not.toHaveProperty("verificationTokenHash");

    const editResponse = await request(app)
      .patch("/api/bookings/manage")
      .send({
        token,
        name: "Magic Test Updated",
        phone: "+358401234571",
        serviceId: settings.services[1].id,
        appointmentAt: secondSlot,
        notes: "Updated by magic link"
      })
      .expect(200);

    expect(editResponse.body.booking.name).toBe("Magic Test Updated");
    expect(editResponse.body.booking.appointmentAt).toBe(secondSlot);
    expect(editResponse.body.booking).not.toHaveProperty("verificationTokenHash");

    const cancelResponse = await request(app)
      .patch("/api/bookings/manage/cancel")
      .send({ token })
      .expect(200);

    expect(cancelResponse.body.booking.status).toBe("canceled");
  });

  it("sends customer and owner emails when a booking is created", async () => {
    sendMailMock.mockClear();
    const [{ EmailJob }, { processDueEmailJobs }] = await Promise.all([
      import("../server/src/models/EmailJob.js"),
      import("../server/src/emailJobs.js")
    ]);
    const availabilityResponse = await request(app)
      .get(`/api/availability?start=${futureBusinessDate(10)}&days=1`)
      .expect(200);
    const slotStartAt = availabilityResponse.body.days[0].slots[0].slotStartAt;

    await request(app)
      .post("/api/bookings")
      .send({
        name: "Email Notice Customer",
        email: "email-notice@example.com",
        phone: "+358401234572",
        serviceId: "standard-home",
        appointmentAt: slotStartAt,
        notes: "Email notice test"
      })
      .expect(201);

    await expect(EmailJob.countDocuments({ status: "pending" })).resolves.toBeGreaterThanOrEqual(2);
    await processDueEmailJobs();

    const subjects = sendMailMock.mock.calls.map((call) => call[0]?.subject);

    expect(subjects).toContain("Manage your booking request");
    expect(subjects).toContain("New booking request from Email Notice Customer");
  });

  it("lets monitor retry failed email jobs, unlock stale jobs, and send a test email", async () => {
    sendMailMock.mockClear();
    const { EmailJob } = await import("../server/src/models/EmailJob.js");
    const monitorAgent = request.agent(app);
    await monitorAgent.post("/api/monitor/login").send({ password: "admin1234" }).expect(200);
    const csrfToken = await getMonitorCsrf(monitorAgent);

    const failedJob = await EmailJob.create({
      type: "ownerBookingNotice",
      status: "failed",
      idempotencyKey: `failed-monitor-test:${Date.now()}`,
      payload: {
        to: "owner@localhost.test",
        businessName: "Service Booking Business",
        customerName: "Failed Email Customer",
        customerEmail: "failed-email@example.com",
        customerPhone: "+358401234580",
        serviceName: "Standard Service Visit",
        appointmentLabel: "Test appointment",
        adminUrl: "http://localhost:5173/admin"
      },
      runAt: new Date(),
      attempts: 2,
      maxAttempts: 5,
      lastError: "SMTP test failure"
    });
    const staleJob = await EmailJob.create({
      type: "bookingVerification",
      status: "processing",
      idempotencyKey: `stale-monitor-test:${Date.now()}`,
      payload: {
        to: "stale@example.com",
        name: "Stale Customer",
        serviceName: "Standard Service Visit",
        manageUrl: "http://localhost:5173/manage-booking?token=test"
      },
      runAt: new Date(Date.now() - 60 * 60 * 1000),
      lockedUntil: new Date(Date.now() - 60 * 1000),
      attempts: 1,
      maxAttempts: 5
    });

    await monitorAgent
      .post(`/api/monitor/email-jobs/${failedJob._id}/retry`)
      .set("x-csrf-token", csrfToken)
      .expect(200)
      .expect((response) => {
        expect(response.body.job.status).toBe("pending");
        expect(response.body.job.attempts).toBe(0);
      });

    await monitorAgent
      .post(`/api/monitor/email-jobs/${staleJob._id}/unlock`)
      .set("x-csrf-token", csrfToken)
      .expect(200)
      .expect((response) => {
        expect(response.body.job.status).toBe("pending");
        expect(response.body.job.lockedUntil).toBeUndefined();
      });

    await monitorAgent
      .post("/api/monitor/test-email")
      .set("x-csrf-token", csrfToken)
      .send({ to: "monitor@example.com" })
      .expect(200)
      .expect((response) => {
        expect(response.body.sent).toBe(true);
        expect(response.body.to).toBe("monitor@example.com");
      });

    expect(sendMailMock.mock.calls.at(-1)?.[0]?.subject).toBe("Monitoring test email");
  });

  it("sends due reminder and review emails once", async () => {
    sendMailMock.mockClear();
    const [{ Booking }, { getBusinessSettings }, { processDueAutomatedBookingEmails }] =
      await Promise.all([
        import("../server/src/models/Booking.js"),
        import("../server/src/services.js"),
        import("../server/src/automatedEmails.js")
      ]);
    const settings = await getBusinessSettings();
    const now = new Date();
    const reminderAppointmentAt = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const reviewAppointmentAt = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const reviewAppointmentEndAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);

    const reminderBooking = await Booking.create({
      name: "Reminder Customer",
      email: "reminder@example.com",
      phone: "+358401234575",
      serviceId: settings.services[0].id,
      serviceName: settings.services[0].name,
      serviceDurationHours: settings.services[0].durationHours,
      appointmentAt: reminderAppointmentAt,
      appointmentEndAt: new Date(
        reminderAppointmentAt.getTime() + settings.services[0].durationHours * 60 * 60 * 1000
      ),
      status: "open",
      emailVerified: true,
      emailVerifiedAt: now
    });
    const reviewBooking = await Booking.create({
      name: "Review Customer",
      email: "review@example.com",
      phone: "+358401234576",
      serviceId: settings.services[0].id,
      serviceName: settings.services[0].name,
      serviceDurationHours: settings.services[0].durationHours,
      appointmentAt: reviewAppointmentAt,
      appointmentEndAt: reviewAppointmentEndAt,
      status: "resolved",
      emailVerified: true,
      emailVerifiedAt: now,
      resolvedAt: reviewAppointmentEndAt
    });

    await processDueAutomatedBookingEmails(now);

    const subjects = sendMailMock.mock.calls.map((call) => call[0]?.subject);

    expect(subjects).toContain(
      `Reminder: your ${settings.services[0].name} appointment is coming up`
    );
    expect(subjects).toContain(`How was your ${settings.services[0].name}?`);

    const updatedReminderBooking = await Booking.findById(reminderBooking._id).lean();
    const updatedReviewBooking = await Booking.findById(reviewBooking._id).lean();

    expect(updatedReminderBooking?.reminderEmailSentAt).toBeDefined();
    expect(updatedReviewBooking?.reviewEmailSentAt).toBeDefined();

    sendMailMock.mockClear();
    await processDueAutomatedBookingEmails(now);

    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
