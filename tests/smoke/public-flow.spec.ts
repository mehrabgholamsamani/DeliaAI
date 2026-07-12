import { expect, test, type Page } from '@playwright/test';

const service = {
  id: 'consultation-id',
  slug: 'consultation',
  name: 'Consultation',
  description: 'A focused appointment to discuss your needs.',
  priceLabel: 'From $60',
  durationMinutes: 60,
  isActive: true
};

async function mockPlatformApi(page: Page) {
  await page.route('**/api/services', (route) => route.fulfill({ json: [service] }));
  await page.route('**/api/availability**', (route) =>
    route.fulfill({
      json: {
        timezone: 'Europe/Berlin',
        days: [{ date: '2026-07-16', slots: [{ startAt: '2026-07-16T09:00:00.000Z', available: true }] }]
      }
    })
  );
  await page.route('**/api/bookings', (route) =>
    route.fulfill({
      json: {
        booking: {
          id: 'booking-id',
          appointmentAt: '2026-07-16T09:00:00.000Z',
          appointmentEndAt: '2026-07-16T10:00:00.000Z',
          status: 'OPEN',
          customer: { name: 'Smoke Customer', email: 'smoke@example.com', phone: '+49 30 123456' },
          service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes }
        },
        manageToken: 'a-secure-management-token'
      }
    })
  );
  await page.route('**/api/bookings/manage', (route) =>
    route.fulfill({
      json: {
        id: 'booking-id',
        appointmentAt: '2026-07-16T09:00:00.000Z',
        appointmentEndAt: '2026-07-16T10:00:00.000Z',
        status: 'OPEN',
        customer: { name: 'Smoke Customer', email: 'smoke@example.com', phone: '+49 30 123456' },
        service: { id: service.id, name: service.name, durationMinutes: service.durationMinutes }
      }
    })
  );
}

test.beforeEach(async ({ page }) => mockPlatformApi(page));

test('current public pages render and navigate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /booking website with a receptionist/i })).toBeVisible();
  await page.getByRole('link', { name: 'Explore services' }).click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.getByRole('heading', { name: /choose the appointment/i })).toBeVisible();
  await page.getByRole('link', { name: /book this service/i }).click();
  await expect(page).toHaveURL(/\/booking\?service=consultation-id$/);
});

test('current booking form creates a booking and opens its management link', async ({ page }) => {
  await page.goto('/booking?service=consultation-id');
  await page.getByRole('button', { name: /jul 16/i }).click();
  await page.getByLabel('Name').fill('Smoke Customer');
  await page.getByLabel('Email').fill('smoke@example.com');
  await page.getByLabel('Phone').fill('+49 30 123456');
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page).toHaveURL(/\/manage-booking\?token=a-secure-management-token&created=1$/);
});
