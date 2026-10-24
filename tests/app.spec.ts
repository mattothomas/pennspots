import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { SearchResult, RoomResult } from '../src/shared/types';

const selection = {
  date: '2026-10-25',
  time: '12:00',
  duration: 60,
  start: '2026-10-25T12:00:00-04:00',
  end: '2026-10-25T13:00:00-04:00',
};
const room: RoomResult = {
  id: 8570,
  name: 'Paterno E304',
  capacity: 16,
  library: 'Pattee / Paterno Library',
  groupId: 2159,
  amenities: ['Whiteboard', 'Power outlets'],
  status: 'available',
  reason: 'Listed as available for your full time.',
  availableUntil: '2026-10-25T14:00:00-04:00',
  slots: [
    {
      roomId: 8570,
      start: '2026-10-25T11:00:00-04:00',
      end: '2026-10-25T14:00:00-04:00',
      state: 'free',
    },
  ],
};
const data: SearchResult = {
  selection,
  rooms: [
    room,
    {
      ...room,
      id: 30978,
      name: 'Paterno E128A',
      capacity: 4,
      amenities: ['Solstice'],
      status: 'unavailable',
      availableUntil: undefined,
      nextStart: '2026-10-25T14:00:00-04:00',
    },
    {
      ...room,
      id: 400,
      name: 'EMS Group Room',
      capacity: 6,
      library: 'Earth and Mineral Sciences Library',
      amenities: ['Screen monitor'],
      status: 'available',
    },
  ],
  checkedAt: '2026-10-24T23:00:00Z',
  catalogCheckedAt: '2026-10-24T23:00:00Z',
  timezone: 'America/New_York',
  source: 'https://psu.libcal.com/spaces',
  endTimePreserved: false,
};
const path = '/?date=2026-10-25&time=12:00&duration=60';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/search?*', (route) => route.fulfill({ json: data }));
});

test('students filter by capacity, amenities, library, and full-interval availability', async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.getByRole('article')).toHaveCount(2);
  const filters = await page
    .getByRole('complementary', { name: 'Room filters' })
    .boundingBox();
  const whiteboard = await page
    .getByLabel('Whiteboard', { exact: true })
    .boundingBox();
  expect(whiteboard!.x).toBeGreaterThanOrEqual(filters!.x);
  expect(whiteboard!.x + whiteboard!.width).toBeLessThanOrEqual(
    filters!.x + filters!.width,
  );
  await page.getByLabel('Group size').selectOption('8');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Paterno E304', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'All rooms', exact: false }).click();
  await page.getByLabel('Group size').selectOption('1');
  await expect(page.getByRole('article')).toHaveCount(3);
  await page.getByLabel('Whiteboard', { exact: true }).check();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page
    .getByLabel('Library', { exact: true })
    .selectOption('Earth and Mineral Sciences Library');
  await expect(
    page.getByRole('heading', { name: 'Let’s find another opening' }),
  ).toBeVisible();
});

test('favorites persist in this browser and the dialog supports keyboard dismissal', async ({
  page,
}) => {
  await page.goto(path);
  await page
    .getByRole('button', { name: 'Save Paterno E304 to favorites' })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Remove Paterno E304 from favorites' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Saved rooms/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'View room' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('booking clearly discloses the end-time step and opens the selected official room/start', async ({
  page,
}) => {
  await page.route('**/api/booking-link', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      roomId: 8570,
      date: '2026-10-25',
      time: '12:00',
      duration: 60,
    });
    await route.fulfill({
      json: {
        url: 'https://psu.libcal.com/space/8570?date=2026-10-25+12%3A00%3A00',
        selection,
        room: room.name,
        preserved: ['room', 'date', 'start'],
        endTimePreserved: false,
        notice: 'Choose your end time.',
      },
    });
  });
  await page.route('https://psu.libcal.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Official booking destination</h1>',
    }),
  );
  await page.goto(path);
  await page
    .getByRole('article')
    .filter({
      has: page.getByRole('heading', { name: 'Paterno E304', exact: true }),
    })
    .getByRole('button', { name: 'View room' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('End-time transfer is not supported yet.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText('12:00 PM – 1:00 PM', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue to Penn State' }).click();
  await expect(page).toHaveURL(/psu\.libcal\.com\/space\/8570\?date=/);
  expect(new URL(page.url()).searchParams.get('date')).toBe(
    '2026-10-25 12:00:00',
  );
});

test('a last-minute availability change keeps the student on PennSpots', async ({
  page,
}) => {
  await page.route('**/api/booking-link', (route) =>
    route.fulfill({
      status: 409,
      json: {
        error: 'This room is no longer confirmed available for your full time.',
      },
    }),
  );
  await page.goto(path);
  await page.getByRole('button', { name: 'View room' }).first().click();
  await page.getByRole('button', { name: 'Continue to Penn State' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'no longer confirmed available',
  );
  await expect(page).toHaveURL(/127\.0\.0\.1/);
});

test('source outages show an actionable error instead of empty availability', async ({
  page,
}) => {
  await page.route('**/api/search?*', (route) =>
    route.fulfill({
      status: 503,
      json: { error: 'Penn State availability could not be checked.' },
    }),
  );
  await page.goto(path);
  await expect(page.getByRole('alert')).toContainText(
    'We couldn’t check availability',
  );
  await expect(
    page.getByRole('button', { name: 'Try again', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('the phone layout fits the viewport and exposes usable filters', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(page.getByRole('article')).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('Library', { exact: true })).toBeVisible();
  await page
    .getByLabel('Library', { exact: true })
    .selectOption('Earth and Mineral Sciences Library');
  await expect(page.getByRole('article')).toHaveCount(1);
});

test('results and booking dialog pass automated WCAG accessibility checks', async ({
  page,
}) => {
  await page.goto(path);
  await page.getByRole('button', { name: 'All rooms', exact: false }).click();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'View room' }).first().click();
  const dialog = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(dialog.violations).toEqual([]);
});
