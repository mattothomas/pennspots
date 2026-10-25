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
      groupId: 2157,
      library: 'Earth and Mineral Sciences Library',
      amenities: ['Screen monitor'],
    },
  ],
  checkedAt: '2026-10-24T23:00:00Z',
  catalogCheckedAt: '2026-10-24T23:00:00Z',
  timezone: 'America/New_York',
  source: 'https://psu.libcal.com/spaces',
  endTimePreserved: false,
};
const path = '/?date=2026-10-25&time=12:00&duration=60';
const pattee = 'View Pattee & Paterno Library details';

// Behavior tests exercise the real WebGL renderer with empty vector-tile fixtures.
// Live basemap appearance is checked separately using real provider assets.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/search?*', (route) => route.fulfill({ json: data }));
  await page.route('**/api/map-config', (route) =>
    route.fulfill({ json: { mapboxAccessToken: '', mapboxStyleUrl: '' } }),
  );
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.request().url().endsWith('/planet')
      ? route.fulfill({
          json: {
            tilejson: '3.0.0',
            tiles: ['https://tiles.openfreemap.org/fixture/{z}/{x}/{y}.pbf'],
            minzoom: 0,
            maxzoom: 14,
            attribution: 'Test fixture',
          },
        })
      : route.fulfill({
          contentType: 'application/x-protobuf',
          body: Buffer.alloc(0),
        }),
  );
});

test('the initial view is a full-height map and compact library list', async ({
  page,
}) => {
  await page.goto(path);
  await expect(
    page.getByRole('button', { name: pattee, exact: true }),
  ).toBeVisible();
  await expect(page.locator('.library-row')).toHaveCount(4);
  await expect(page.locator('.map-library')).toHaveCount(4, { timeout: 20000 });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const sidebar = await page.getByRole('complementary').boundingBox(),
    map = await page
      .getByRole('region', { name: 'University Park campus map' })
      .boundingBox();
  expect(sidebar!.width).toBeLessThan(map!.width);
  expect(Math.abs(sidebar!.height - map!.height)).toBeLessThan(2);
  expect(
    await page
      .locator('.app-shell')
      .evaluate((e) =>
        getComputedStyle(e).getPropertyValue('--background').trim(),
      ),
  ).toBe('#0a0a0a');
});

test('library rows and map markers open the same rooms, with expandable schedules', async ({
  page,
}) => {
  await page.goto(path);
  await page.getByRole('button', { name: pattee, exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Pattee & Paterno Library',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page
    .getByRole('button', { name: /Paterno E304.*Available until/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Reserve this room' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back to libraries' }).click();
  await page
    .getByRole('button', {
      name: /View Earth & Mineral Sciences Library on map/,
    })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Earth & Mineral Sciences Library',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(1);
});

test('search and filters operate without replacing the map layout', async ({
  page,
}) => {
  await page.goto(path);
  await page.getByLabel('Search libraries and rooms').fill('E304');
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Group size').selectOption('8');
  await page.getByLabel('Whiteboard', { exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.library-row')).toHaveCount(1);
  await page.getByRole('button', { name: pattee, exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(
    page.getByRole('region', { name: 'University Park campus map' }),
  ).toBeVisible();
});

test('favorites persist and menu controls map visibility and theme', async ({
  page,
}) => {
  await page.goto(path);
  await page.getByRole('button', { name: pattee, exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Save Paterno E304 to favorites',
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Remove Paterno E304 from favorites' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Hide map', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'University Park campus map' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: 'Light theme', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveClass(/light/);
});

test('booking discloses the end-time limitation and targets the selected room/start', async ({
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
        endTimePreserved: false,
      },
    });
  });
  await page.route('https://psu.libcal.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Official booking</h1>',
    }),
  );
  await page.goto(path);
  await page.getByRole('button', { name: pattee, exact: true }).click();
  await page
    .getByRole('button', { name: /Paterno E304.*Available until/ })
    .click();
  await page.getByRole('button', { name: 'Reserve this room' }).click();
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

test('a booking conflict stays on PennSpots and dialogs dismiss with Escape', async ({
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
  await page.getByRole('button', { name: pattee, exact: true }).click();
  await page
    .getByRole('button', { name: /Paterno E304.*Available until/ })
    .click();
  await page.getByRole('button', { name: 'Reserve this room' }).click();
  await page.getByRole('button', { name: 'Continue to Penn State' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer confirmed');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('source outages do not pretend libraries are closed or available', async ({
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
    'Availability unavailable',
  );
  await expect(page.locator('.library-row')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
});

test('phone layout shows map above an independently scrolling sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await expect(
    page.getByRole('button', { name: pattee, exact: true }),
  ).toBeVisible();
  const map = await page
      .getByRole('region', { name: 'University Park campus map' })
      .boundingBox(),
    sidebar = await page.getByRole('complementary').boundingBox();
  expect(map!.y).toBeLessThan(sidebar!.y);
  expect(map!.height).toBeGreaterThan(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Select date and time' }).click();
  await expect(page.getByLabel('Start time', { exact: true })).toBeVisible();
});

test('keyboard sidebar resizing and dark/light accessibility checks pass', async ({
  page,
}) => {
  await page.goto(path);
  await expect(page.locator('.map-library')).toHaveCount(4, { timeout: 20000 });
  const separator = page.getByRole('separator', { name: 'Resize sidebar' });
  await separator.focus();
  await page.keyboard.press('ArrowRight');
  await expect(separator).toHaveAttribute('aria-valuenow', '496');
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page
        .getByRole('button', { name: 'Light theme', exact: true })
        .click();
    }
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
