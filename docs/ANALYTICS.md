# Product analytics

Phase 1: anonymous product-usage events, answering *traffic → activation → export → retention*.
Phase 2 (feature adoption) and Phase 3 are **intentionally not implemented yet**.

## Platform

PostHog Cloud, **product analytics only**. Loaded lazily from `posthog-js/no-external` (a build that
never loads remote scripts), and only when analytics is enabled. Autocapture, pageviews/pageleave,
session recording, heatmaps, dead/rage clicks, exception autocapture, web vitals, surveys, product
tours, web experiments, site apps and feature flags are all **off**. `advanced_disable_flags`
removes the `/flags` call, so turning a feature on in the PostHog UI cannot reach the client.

## Code layout

| File | Role |
|---|---|
| `src/lib/analytics.ts` | The only module that talks to PostHog. Typed helpers the app calls; init, identity, globals, UTMs, internal flag, modes. |
| `src/lib/analyticsPrivacy.ts` | Event/property types and allowlist, value rules, the `before_send` scrubber, buckets, UTM/device parsing. Pure. |
| `src/lib/analyticsLedger.ts` | The local ledger (first seen, active days, first milestones, first touch, ready plans). Pure. |
| `src/lib/analyticsMilestones.ts` | Derived plan facts (`quantities_ready`) via the app's own `buildRoomSummaries`. Pure. |
| `src/lib/analyticsDedupe.ts` | Once-per-key / settle-then-once (manual alignment, repeated errors). Pure. |

Never import `posthog-js` anywhere else. Add a property by adding it to `AnalyticsEvents` **and**
`EVENT_PROPS` in `analyticsPrivacy.ts` (the build fails if the two disagree).

## Privacy rules

Only these may be sent: random internal UUIDs, booleans, counts and bucketed counts, durations,
enum values (work types, export kinds, room-template keys, …), UTM values, app version, device
class, and the browser/OS metadata the SDK adds.

**Never sent:** PDF content, rendered plans or images, project / plan / comparison / revision / room
names, apartment numbers, file names, notes, markup text, dimension or measurement labels, exact
quantities, calibration distances, coordinates, raw error messages (only the error class name).

Enforced three times: the TypeScript event types (no free-text property exists), `sanitizeEventProps`
at `track` (listed keys only; strings must match `[A-Za-z0-9_-]{1,64}`; `*_id` must be a UUID), and
the PostHog `before_send` scrubber (drops any event that is not ours, rebuilds properties from the
allowlist, reduces every SDK URL/referrer property to origin + path). Tests in
`tests/analytics/privacy.test.ts` push names, file names and messages through every event.

The home screen says plans and projects stay on this computer and anonymous usage statistics may be
collected. Keep that true.

## Identity and retention (no accounts)

A local ledger in `localStorage` (`bc_analytics_ledger_v1`, separate from project data in IndexedDB)
holds an anonymous `device_id` — bootstrapped as PostHog's distinct id — plus `first_seen_at`,
`last_active_day`, `active_days`, `first_project_at`, `first_comparison_at`, `first_activation_at`,
`first_export_at`, `first_touch` and the plans that already reached `quantities_ready`.
A device is *returning* when opened on a later calendar day than first seen; a day is *active* when
it has at least one event other than `app_opened` / `error_occurred`. Identity is per browser
profile: another device, browser, private window or cleared site data is a new user.

**Anonymous events, no person profiles.** PostHog runs with `person_profiles: 'identified_only'`
and the app never calls `identify`, `alias`, `group`, `setPersonProperties` or `createPersonProfile`,
and never sends `$set` / `$set_once` — so every event goes out with `$process_person_profile: false`
and no person profile is created. Funnels, trends and retention work on the anonymous distinct id
(the ledger's `device_id`). Not available without profiles, by PostHog's design: cohorts,
person-property filters and the Lifecycle insight — new vs returning comes from our own
`is_returning` / `days_since_first_seen` / `active_days` event properties instead.

- If accounts or login are added, introduce `identify()` then (it merges this anonymous history).
- Person profiles can be reconsidered later if there is a real need for person properties or
  cohorts — not before.

## Phase 1 events

| Event | Fires when | Properties |
|---|---|---|
| `app_opened` | once per page load | `has_local_data`, `local_project_count_bucket`, `is_returning`, `days_since_first_seen`, `device_class`, `in_app_browser` |
| `project_created` | project saved | `project_id`, `with_first_plan`, `is_first_project` |
| `project_opened` | opened from the home list (not the internal open after creating) | `project_id`, `project_age_days`, `plan_count`, `comparison_count` |
| `plan_created` | plan + PDF saved (upload or duplicate) | `plan_id`, `project_id`, `method`, `pdf_size_bucket`, `plan_index` |
| `plan_opened` | the plan's PDF first **renders** after the plan is loaded | `plan_id`, `project_id`, `page_count`, `plan_age_days`, `calibrated_pages`, `room_count` |
| `calibration_completed` | a page scale is applied | `plan_id`, `is_recalibration`, `calibrated_pages`, `page_count` |
| `room_created` | polygon, rectangle, room duplicate, apartment duplicate | `plan_id`, `method`, `count`, `template_key`, `page_calibrated`, `room_count` |
| `work_item_added` | manual add, new-room template, room type seeding, apply template (not duplicates) | `plan_id`, `work_types`, `count`, `source` |
| `quantities_ready` | **derived**, once per plan ever: after a save, a calibrated page holds a room whose work items give a quantity > 0 | `plan_id`, `project_id`, `rooms_with_qty`, `work_types`, `minutes_since_plan_created` |
| `export_completed` | any export handed to the browser download | `export_kind`, `surface`, `pages_count`, `page_scope`, `revision_scope`, `revision_count`, `plan_count`, `work_types`, `waste_applied`, `region_cropped`, `room_count_bucket`, `duration_ms`, `is_first_export`, ids |
| `comparison_created` | comparison saved | `comparison_id`, `project_id`, `revision_count`, `is_first_comparison` |
| `comparison_opened` | opened from the project overview | `comparison_id`, `project_id`, `comparison_age_days`, `revision_count` |
| `revision_added` | a revised PDF added in the layers panel and stored | `comparison_id`, `revision_count` |
| `alignment_completed` | point-pair solve (at once) or manual drag/sliders (after 1.5 s without movement); once per comparison × revision × page × method per session | `comparison_id`, `method` |
| `change_marked` | a Compare area measurement classified demolition / new construction | `comparison_id`, `area_kind`, `calc_mode`, `shape` |
| `error_occurred` | plan/comparison save failure, PDF / compare PDF load failure, export failure | `area`, `error_name`, `export_kind` |

Every event also carries the global properties `app_version` (build git SHA), `device_class`,
`in_app_browser`, `days_since_first_seen`, `active_days`, `first_utm_*` and session `utm_*`.

**Activation:** `quantities_ready` (takeoff) or `alignment_completed` (Compare), within 7 days.
A plan that already has quantities when it is loaded (reopened, duplicated, or finished before
analytics existed) is recorded silently and never fires `quantities_ready`.

Deliberately **not** tracked: overlay/swipe/blink switching, the blink timer, undo/redo, per-keystroke
edits (names, heights, waste), drag bursts (vertices, markups), revision/page switching (the Compare
export drives them), and the hidden auto room detection.

**Naming:** `object_action`, snake_case, past tense. Properties snake_case; enums lowercase.

## UTM convention

Lowercase, `a-z 0-9 _ -` only; anything else is dropped. Record every link in the link registry.

| Param | Values |
|---|---|
| `utm_source` | `instagram`, `facebook`, `whatsapp`, `linkedin`, `tiktok`, `youtube`, `email`, `website`, `partner_<name>` |
| `utm_medium` | `organic`, `paid`, `dm`, `email`, `referral` |
| `utm_campaign` | theme slug: `launch`, `always_on`, `compare_feature`, … |
| `utm_content` | `<format>_<topic>[_v2]`: `carousel_why_bettercalc`, `reel_calibration_60s`, `story_calibration_demo`, `bio_link` |

Example: `?utm_source=instagram&utm_medium=organic&utm_campaign=launch&utm_content=carousel_why_bettercalc`

On load the wrapper reads them, removes every `utm_*` (and `bc_internal`) from the address bar with
`history.replaceState`, stores the **first visit's** UTMs as first touch (in the local ledger, and
attached to every event as `first_utm_*`), and the current visit's as session touch
(`utm_*`, kept for the browser session).

## When analytics is off

Nothing is sent, the SDK is not even downloaded, and no ledger is written, when any of:

- `npm run dev` (`import.meta.env.DEV`);
- `VITE_POSTHOG_KEY` or `VITE_POSTHOG_HOST` missing;
- automation (`navigator.webdriver`, e.g. the Playwright `demo/` scripts);
- the browser is flagged internal.

**Internal flag:** open the app once with `?bc_internal=1` — that browser never sends again.
Clear it with `?bc_internal=0`, or in the console: `localStorage.removeItem('bc_analytics_internal')`.

## Testing without polluting production

- `npm test` — privacy scrubber, ledger, `quantities_ready` and alignment dedupe (Node's test runner).
- **Console only:** `VITE_ANALYTICS_DEBUG=true npm run dev` logs each event with exactly the
  properties that would be sent, and sends nothing.
- **Staging:** create a separate PostHog project and build with its key
  (`VITE_POSTHOG_KEY=<staging key> VITE_POSTHOG_HOST=… npm run build && npm run preview`).
  Never put the production key in `.env.local`.
- **Payload inspection:** point `VITE_POSTHOG_HOST` at a local server that logs request bodies.

## Manual PostHog setup

In the PostHog project settings: enable **Discard client IP data** (the SDK's `ip` option no longer
exists), set the project **time zone to Asia/Jerusalem** (day boundaries for retention), choose a
data retention period, and keep Session replay, Heatmaps, Surveys and Autocapture disabled there too.
