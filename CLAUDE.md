# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server on :5173 (also defined in .claude/launch.json as "dev")
npm run build    # tsc -b && vite build — this is the typecheck; run it after every change
npm run lint     # oxlint
npm test         # node:test — analytics privacy/ledger/milestone tests only (tests/)
```

The build is the main automated check, and `tsconfig.app.json` sets
`noUnusedLocals`/`noUnusedParameters`, so leftover imports or variables fail it.

## What this is

A browser-only quantity-takeoff tool for Israeli finishing contractors. Everything runs client-side:
PDFs and project data live in IndexedDB, there is no server, no auth. The only network traffic is
anonymous product analytics (PostHog), which goes exclusively through `src/lib/analytics.ts` and
never carries plan content — read `docs/ANALYTICS.md` before adding or changing an event. The UI is
Hebrew by default (`index.html` is `lang="he" dir="rtl"`); an English UI exists but has no selector
yet. User-facing strings live in `src/i18n` — see "Languages" below.

## Languages

`src/i18n/he.ts` is the source dictionary and `en.ts` must match its shape (a missing key fails the
build; `tests/i18n` checks placeholders). Components use `useT()`; stores and libs use `t()`. Counts
that can be 1 are written `{count} {count|room|rooms}` in English (Hebrew has no such syntax). Each
language's `<html lang dir>` and date/number locale come from `LANGUAGES`.

- **Dev override, not a feature:** `?lang=en` runs the English UI and `?dir=ltr` forces a direction
  (`src/main.tsx`, dev server only, compiled out of production). Production opens in the saved
  language, Hebrew by default; there is no browser-language detection.
- **Exports are pinned to Hebrew** (`EXPORT_LANGUAGE`, `tExport`) until English reports exist. Export
  code must never call the UI's `t`; shared helpers take a `tr` argument that exports pass `tExport`.
  Compare's export also re-renders the plan layers in a Hebrew RTL context when the page is not one.
- Never translate saved data: names, notes, imported text, room-detection keywords (`roomProfiles`
  labels), legacy label formats, migration fallbacks (`db/database.ts`).
- On-plan overlay stays direction-stable (SVG pinned RTL; text notes anchored); only UI-made labels
  (`lib/textDirection`) follow the language.
- `node demo/regression/ltr-tour.mjs [en]` tours the UI in LTR; `capture.mjs` (+ `BC_LANG=en`) and
  `compare.mjs` prove Hebrew UI and exports are unchanged.

## Two apps, one shell

`src/App.tsx` picks between two entirely separate features that happen to share the shell,
the canvas engine and the geometry/markup libraries:

| | Quantity takeoff | Revision Compare |
|---|---|---|
| Entity | `Project` → `Plan`s (`src/types/index.ts`) | `Comparison` (`src/types/compare.ts`) |
| Store | `src/store/appStore.ts` | `src/store/compareStore.ts` |
| Viewer | `src/components/PdfViewer.tsx` | `src/components/compare/CompareCanvas.tsx` |
| Purpose | Projects of plans; draw rooms on a plan → work items → m² + waste → per-plan and per-project Excel/PDF | Overlay an original plan with one or more revised plans, align, measure, mark up |

In takeoff, a `Project` is a thin folder (`name`, ordered `planIds`); each `Plan` is its own saved
document holding one PDF plus everything measured on it (this type was called `Project` before
projects existed). Only one plan is in memory: the store key `project` is the open **plan**, and
`currentProject`/`projectPlans` describe the folder around it. Leaving a plan (switch, overview,
home) always persists it first. Project totals come from `src/lib/projectQuantities.ts`, which only
sums each plan's own `buildRoomSummaries` — never re-implement work-type logic there.

Revision Compare comparisons also belong to a project (`Comparison.projectId`, ordered
`Project.comparisonIds`), but stay their own documents in their own store, opened in the unchanged
Compare workspace. Projects are the only entrance: home lists projects; the overview lists quantity
plans and revision comparisons separately.

`types/compare.ts` deliberately re-declares `Markup`, `Measurement`, `AreaKind`, etc. rather than
importing them from `types/index.ts` — the two features are allowed to diverge. When you change a
markup or measurement field, decide explicitly whether both sides need it, and expect to touch
both viewers plus both toolbars.

## Coordinate system (the single most important convention)

Every persisted point — room polygons, measurements, markups, calibration, export regions — is in
**native page pixels**: pdf.js `getViewport({ scale: 1 })`, top-left origin. Nothing stored is in
screen or device pixels.

- `useCanvasTransform` (`src/hooks/useCanvasTransform.ts`) owns zoom/pan and provides
  `screenToNative(clientX, clientY)`. All mouse handlers convert on entry.
- The `<canvas>` is rasterized at `RENDER_SCALE` (2–4×, DPR-dependent) but the overlay `<svg>` uses
  `viewBox="0 0 nativeW nativeH"`, so overlay code writes native coordinates directly.
- Real-world values come from a per-page `Calibration.metersPerPixel`. With no calibration for a
  page, areas and lengths are 0 — that is expected, not a bug.
- In Compare, the revised layer additionally goes through `src/lib/alignment.ts`
  (`applyAlignment` / `invertAlignment` / `solveAlignment`). That file is written to mirror the CSS
  `transform: translate() rotate() scale()` with `transform-origin: 50% 50%` exactly; the pivot is
  the *revised* page's centre. Change one and you must change the other.

## Store pattern

Both stores hold one big immutable object (`project` / `comparison`) that is replaced wholesale on
every mutation, plus non-persisted UI state (tool mode, in-progress points, export regions,
history).

- **Undo/redo**: `src/lib/undoHistory.ts` `createHistoryTracker`. Call `push(get, set, before)` for
  discrete actions and `pushDebounced(...)` for bursts (typing, dragging a vertex or slider).
  Every call in one burst must go through `pushDebounced`, including the "quiet" ones, or the
  snapshot captured will be mid-burst. Stacks are not persisted.
- **Autosave**: a module-level `scheduleSave` debounces `persist()` by 800 ms.
- **`*Quiet` variants** (`updateMarkupQuiet`, `updatePageQuiet`, …) skip the autosave schedule and
  use `pushDebounced`; they exist for continuous drags, and the caller persists when the drag ends.

## Persistence and migrations

`src/db/database.ts` — `idb`, DB `bettercalc-qto` (v3), five stores: `projects` (holds **plans**;
name kept so no record had to move), `pdfFiles` (Blob keyed by planId), `takeoffProjects` (project
folders), `comparisons`, `comparePdfFiles` (Blob keyed by `${comparisonId}:original` or
`${comparisonId}:revision:${revisionId}`). `migrateLegacyPlans` wraps any plan without a project
(pre-v3 data) into project `legacy-${planId}` on load, and `migrateLegacyComparisons` does the same
for comparisons (`legacy-cmp-${comparisonId}`) — both idempotent.

Schema changes to saved documents are handled by **lazy migrations on load**, not by the IndexedDB
`upgrade` callback: `migrateComparison` converts the old single-`revised*`-layer shape into the
`revisions[]` array and re-attributes comparison-level markups to a revision. Follow that pattern —
tolerate old shapes on read, rewrite them, and keep the migration idempotent.

`src/lib/pdfCache.ts` caches `PDFDocumentProxy` per key for the session; `src/lib/planSource.ts`
wraps a single page behind the `PlanPageSource` interface (`render`, `renderTinted`, `getTextItems`)
so a future DWG source can drop in without touching viewer code. Load pages through
`loadPdfPlanSource`, never `pdfjsLib.getDocument` directly.

## Drawing is written twice — keep the pairs in sync

Annotations are rendered as SVG on screen and re-rasterized to a 2D canvas for export. There is no
shared renderer, so each shape exists in two places:

- On screen: `MarkupShape` in `PdfViewer.tsx` / `CompareCanvas.tsx`, plus `DimensionShape.tsx` and
  `TextNoteShape.tsx`.
- For export: `src/lib/drawMarkup.ts` (`drawMarkupOnCanvas`) and `src/lib/drawMeasurement.ts`.

Shared geometry lives in `src/lib/geometry.ts` (`cloudPath`, `arrowHeadPoints`, `tickMarkEndpoints`,
shoelace area, ortho snap, …) and `src/lib/dimensionChain.ts` (the AutoCAD-style continued-dimension
chain: reshaping, per-segment labels in whole centimetres, offset/flip geometry). Put anything both
renderers need there. `orderMarkups` must be applied in both paths so `mask` markups draw first.

## PDF export and Hebrew

pdf-lib's standard fonts cannot encode Hebrew. Report text and tables are drawn as **vector PDF
content** through `src/lib/pdfText.ts`: an embedded Noto Sans Hebrew (Hebrew + Latin subsets), each
string reordered with bidi-js on an RTL base, and a canvas-like `PdfPainter` (top-left coordinates,
`fillText` with `textAlign`/`maxWidth` condensing). fontkit reverses Hebrew runs itself, which is why
`fontRuns` hands them over in logical order. Only real images stay raster:

- `src/lib/exportQuantitiesPdf.ts` — the contractor report: plan pages are a raster of the plan and
  its annotations with a vector header; all tables are vector.
- `src/lib/exportProjectPdf.ts` — the project report, vector throughout.
- `src/lib/areaMeasurementTable.ts` — demolition/construction breakdown (vector), shared by both apps.
- `src/lib/exportRegionPdf.ts` — plan page(s), optionally cropped to an `ExportRegion` (raster).
- `src/lib/exportComparePdf.ts` — wraps the composite raster `CompareCanvas` produced, plus vector
  change tables.
- `src/lib/exportExcel.ts` — ExcelJS handles Hebrew natively.

When rasterizing text on a canvas (plan annotations), set `ctx.direction = 'rtl'` and mind text
alignment: SVG's default `text-anchor="start"` under RTL anchors at the text's *right* edge, so the
canvas equivalent is `textAlign = 'right'`.

## Quantities model

`src/lib/quantities.ts`. A `Room` polygon yields area and perimeter; each `WorkItem` on the room
converts those into m²: `tiling` = area, `cladding` = perimeter × height, `panels` = perimeter ×
`PANEL_HEIGHT_M`. Waste % is per-item with a per-type project default; ordered quantity =
quantity × (1 + waste/100). Reports bucket into four `ReportCategory` values (tiling is split
regular/AS). Area *measurements* (`AreaKind` demolition/construction) are a separate tally from
room work items and feed the breakdown table; `numberAreaMeasurements` assigns the shared numbering
so on-canvas labels and the exported table agree.

## Room auto-detection

`src/lib/roomDetection.ts` is a pure-JS heuristic CV pipeline (rasterize → binarize walls → dilate
to close doorways → connected components → contour trace/simplify → match plan text against
`ROOM_PROFILES`). It is a *starting point*; results are always user-editable. `ROOM_PROFILES` also
drives `autoCalculateQuantities`, which only fills rooms that were detected and still have zero
work items, so re-running never overwrites user choices. Merging/splitting detected rooms is not
implemented.

`src/lib/diffEngine.ts` is a deliberate stub — automatic change detection between plan revisions
returns nothing yet.

## Working style here

The user tests in the browser. Implement, run `npm run build` to typecheck, and stop there unless
asked to verify interactively.
