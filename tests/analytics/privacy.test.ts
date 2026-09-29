import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CaptureResult } from 'posthog-js';
import {
  ANALYTICS_EVENT_NAMES,
  countBucket,
  deviceClassFrom,
  errorName,
  inAppBrowserFrom,
  parseUtm,
  pdfSizeBucket,
  sanitizeEventProps,
  sanitizeGlobalProps,
  sanitizeUrl,
  scrubCaptureResult,
  stripConsumedParams,
} from '../../src/lib/analyticsPrivacy.ts';

const ID = '3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f';

/** Every kind of content that must never leave the browser, under names a careless caller might use. */
const SENSITIVE: Record<string, unknown> = {
  project_name: 'מגדל הכרמל',
  plan_name: 'קומה 3',
  name: 'Tower A',
  room_name: 'סלון',
  apartment_number: '12',
  apartmentNumber: '12',
  notes: 'call the client',
  pdf_file_name: 'client-plan.pdf',
  file_name: 'client-plan.pdf',
  text: 'markup text',
  label: '3.24 מ\'',
  quantity_m2: 20.5,
  real_distance_meters: 5,
  points: [{ x: 1, y: 2 }],
  error_message: 'ENOENT /Users/x/client-plan.pdf',
  message: 'boom',
};

test('no event accepts sensitive keys, whatever the event', () => {
  for (const event of ANALYTICS_EVENT_NAMES) {
    const out = sanitizeEventProps(event, SENSITIVE);
    assert.deepEqual(out, {}, `${event} let something through: ${JSON.stringify(out)}`);
  }
});

test('allowed keys still need safe values', () => {
  const out = sanitizeEventProps('project_created', {
    project_id: ID,
    with_first_plan: true,
    is_first_project: false,
  });
  assert.deepEqual(out, { project_id: ID, with_first_plan: true, is_first_project: false });

  // A name smuggled into an id or enum field is rejected by the value rules.
  assert.deepEqual(sanitizeEventProps('project_created', { project_id: 'מגדל הכרמל' }), {});
  assert.deepEqual(sanitizeEventProps('project_created', { project_id: 'tower-a' }), {});
  assert.deepEqual(sanitizeEventProps('error_occurred', { area: 'export', error_name: 'Cannot read file.pdf' }), { area: 'export' });
  assert.deepEqual(sanitizeEventProps('plan_opened', { page_count: Number.NaN, room_count: Infinity }), {});
  assert.deepEqual(sanitizeEventProps('work_item_added', { work_types: ['tiling', 'צבע'] }), {});
  assert.deepEqual(sanitizeEventProps('work_item_added', { work_types: ['tiling', 'painting'], count: 2 }), {
    work_types: ['tiling', 'painting'],
    count: 2,
  });
});

test('legacy migration ids are accepted as ids', () => {
  assert.deepEqual(sanitizeEventProps('plan_created', { project_id: `legacy-${ID}` }), { project_id: `legacy-${ID}` });
  assert.deepEqual(sanitizeEventProps('comparison_created', { project_id: `legacy-cmp-${ID}` }), { project_id: `legacy-cmp-${ID}` });
});

test('global props: only the registered set, with safe values', () => {
  const out = sanitizeGlobalProps({ app_version: 'a1b2c3d', device_class: 'desktop', first_utm_source: 'instagram', project_name: 'x', utm_content: 'has space' });
  assert.deepEqual(out, { app_version: 'a1b2c3d', device_class: 'desktop', first_utm_source: 'instagram' });
});

function capture(event: string, properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}): CaptureResult {
  return { uuid: 'u', event, properties, ...extra } as CaptureResult;
}

test('before_send drops every event that is not ours', () => {
  for (const event of ['$pageview', '$pageleave', '$autocapture', '$exception', '$rageclick', '$dead_click', '$snapshot', '$feature_flag_called', '$web_vitals', 'custom_thing']) {
    assert.equal(scrubCaptureResult(capture(event, {})), null, event);
  }
  assert.equal(scrubCaptureResult(null), null);
});

test('before_send rebuilds properties from the allowlist and scrubs SDK URLs', () => {
  const out = scrubCaptureResult(
    capture(
      'plan_opened',
      {
        plan_id: ID,
        page_count: 3,
        room_name: 'סלון',
        token: 'phc_x',
        distinct_id: 'd',
        $current_url: 'https://app.example.com/?utm_source=instagram&fbclid=abc#frag',
        $referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fapp&e=secret',
        $session_entry_url: 'https://app.example.com/?fbclid=<masked>',
        $session_entry_referrer: '$direct',
        $el_text: 'מגדל הכרמל',
        $browser: 'Chrome',
        app_version: 'abc1234',
        first_utm_content: 'carousel_why_bettercalc',
        $set_once: { first_utm_source: 'instagram', project_name: 'x', $initial_current_url: 'https://a.example/?q=1' },
      },
      { $unset: ['x'] }
    )
  );
  assert.ok(out);
  assert.deepEqual(out.properties, {
    plan_id: ID,
    page_count: 3,
    token: 'phc_x',
    distinct_id: 'd',
    $current_url: 'https://app.example.com/',
    $referrer: 'https://l.instagram.com/',
    $session_entry_url: 'https://app.example.com/',
    $session_entry_referrer: '$direct',
    $browser: 'Chrome',
    app_version: 'abc1234',
    first_utm_content: 'carousel_why_bettercalc',
    $set_once: { first_utm_source: 'instagram', $initial_current_url: 'https://a.example/' },
  });
  assert.equal(out.$unset, undefined);
});

test('URLs keep origin and path only', () => {
  assert.equal(sanitizeUrl('https://x.example/a/b?c=1#d'), 'https://x.example/a/b');
  assert.equal(sanitizeUrl('$direct'), '$direct');
  assert.equal(sanitizeUrl('not a url'), undefined);
  assert.equal(sanitizeUrl(42), undefined);
});

test('UTMs: lowercased, convention-checked, and stripped from the URL with bc_internal', () => {
  assert.deepEqual(parseUtm('?utm_source=Instagram&utm_medium=organic&utm_campaign=launch&utm_content=carousel_why_bettercalc&utm_term=x'), {
    utm_source: 'instagram',
    utm_medium: 'organic',
    utm_campaign: 'launch',
    utm_content: 'carousel_why_bettercalc',
  });
  assert.deepEqual(parseUtm('?utm_source=%D7%A9%D7%9C%D7%95%D7%9D&utm_campaign=has%20space'), {});
  assert.equal(stripConsumedParams('?utm_source=instagram&utm_term=x&bc_internal=1'), '');
  assert.equal(stripConsumedParams('?utm_source=instagram&keep=1'), '?keep=1');
  assert.equal(stripConsumedParams(''), '');
});

test('error names only — never messages', () => {
  const err = new Error('failed to read /Users/me/client-plan.pdf');
  assert.equal(errorName(err), 'Error');
  const quota = new Error('x');
  quota.name = 'QuotaExceededError';
  assert.equal(errorName(quota), 'QuotaExceededError');
  assert.equal(errorName({ name: 'InvalidPDFException', message: 'secret' }), 'InvalidPDFException');
  assert.equal(errorName('a string'), 'UnknownError');
  assert.equal(errorName({ name: 'has spaces in it' }), 'UnknownError');
});

test('buckets', () => {
  assert.deepEqual([0, 1, 2, 5, 6, 20, 21, 500].map(countBucket), ['0', '1', '2_5', '2_5', '6_20', '6_20', '21_plus', '21_plus']);
  const MB = 1024 * 1024;
  assert.deepEqual([0.5 * MB, 1 * MB, 4.9 * MB, 5 * MB, 20 * MB, 21 * MB, undefined].map(pdfSizeBucket), [
    'lt_1mb',
    '1_5mb',
    '1_5mb',
    '5_20mb',
    '5_20mb',
    'gt_20mb',
    'unknown',
  ]);
});

test('device class and in-app browser', () => {
  assert.equal(deviceClassFrom(false, 390), 'desktop');
  assert.equal(deviceClassFrom(true, 390), 'mobile');
  assert.equal(deviceClassFrom(true, 820), 'tablet');
  assert.equal(deviceClassFrom(true, 1200), 'desktop');
  assert.equal(inAppBrowserFrom('Mozilla/5.0 (iPhone) Instagram 300.0.0'), 'instagram');
  assert.equal(inAppBrowserFrom('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400.0]'), 'facebook');
  assert.equal(inAppBrowserFrom('Mozilla/5.0 (Macintosh) Chrome/130'), 'none');
});
