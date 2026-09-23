import { fade } from "@remotion/transitions/fade";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import React from "react";
import { captions } from "./components/Caption";
import { changeTags } from "./components/ChangeTags";
import { DemoScene, demoSceneFrames, SceneClip } from "./scenes/DemoScene";
import { Bridge, EndCard, Intro } from "./scenes/TitleScenes";

// Source timings are seconds into the recordings in demo/output/ (transcoded 1:1 to public/*.mp4):
//   qto.mp4               — approved qto-demo.webm
//   qto-export.mp4        — extra-footage.mjs: same project, then Export -> PDF / Excel
//   compare-extended.mp4  — extra-footage.mjs: overlay, swipe, marking, Changes, export
// Camera keys are [clip frame, focus x, focus y, zoom] in recording pixels (1600×1000).
// Report pages in public/reports/ are the real files those exports produced.

// Where things sit in the recordings.
const FULL = [800, 500, 1] as const;
const EXPORT_MENU = [240, 200, 1.95] as const; // top-bar Export dropdown
const WALL = [708, 560, 2.0] as const; // the moved bedroom partition

const QTO_STEPS = [
  "מעלים תוכנית",
  "מכיילים",
  "מסמנים חדרים",
  "מקבלים כמויות",
  "מייצאים דוח",
];

const QTO_CLIPS: SceneClip[] = [
  {
    step: 0,
    spec: {
      src: "qto.mp4",
      from: 1.4,
      to: 4.2,
      hold: 10,
      cam: [
        [0, 800, 470, 1.06],
        [84, 800, 500, 1.0],
      ],
    },
  },
  {
    // Clicks the plan's own 5.00 m dimension line, enters the length, confirms.
    step: 1,
    spec: {
      src: "qto.mp4",
      from: 4.5,
      to: 8.0,
      cam: [
        [0, ...FULL],
        [22, 720, 650, 1.42],
        [105, 730, 640, 1.46],
      ],
    },
  },
  {
    step: 2,
    spec: {
      src: "qto.mp4",
      from: 10.8,
      to: 23.0,
      rate: 1.7,
      cam: [
        [0, ...FULL],
        [215, 820, 520, 1.08],
      ],
    },
  },
  {
    // Quantities panel slides up at ~25.25 s; push toward the table and its total.
    step: 3,
    spec: {
      src: "qto.mp4",
      from: 24.6,
      to: 29.5,
      hold: 12,
      cam: [
        [0, 820, 520, 1.0],
        [30, 800, 520, 1.0],
        [80, 1010, 810, 1.34],
        [159, 1000, 815, 1.38],
      ],
    },
  },
  {
    // Menu opens ~18.5 s, Excel hovered ~20.5 s, PDF ~21.5 s, PDF clicked ~22.8 s.
    step: 4,
    spec: {
      src: "qto-export.mp4",
      from: 17.6,
      to: 22.95,
      cam: [
        [0, ...FULL],
        [6, ...FULL],
        [30, ...EXPORT_MENU],
        [160, 250, 205, 2.0],
      ],
    },
    overlays: [captions([[34, 158, "כתב כמויות ל-Excel ול-PDF"]])],
  },
  {
    step: 4,
    report: {
      title: "כתב כמויות מוכן",
      formats: ["PDF", "Excel"],
      frames: 86,
      sheets: [
        { src: "qto-1.png", x: 44, y: 178, width: 740, aspect: 1817 / 2400 },
        { src: "qto-2.png", x: 716, y: 300, width: 680, aspect: 960 / 2400 },
      ],
    },
  },
];

const COMPARE_STEPS = [
  "שכבות",
  "החלקה",
  "הריסה ובנייה חדשה",
  "כמויות השינוי",
  "ייצוא דוח",
];

const COMPARE_CLIPS: SceneClip[] = [
  {
    // Revision layer opacity: 75% -> 0 (original only, ~12.3 s) -> 100% (~16.5 s) -> 50% (~19.5 s).
    step: 0,
    spec: {
      src: "compare-extended.mp4",
      from: 10.5,
      to: 19.7,
      rate: 1.6,
      cam: [
        [0, 720, 480, 1.08],
        [173, 730, 480, 1.1],
      ],
    },
    overlays: [
      captions([
        [30, 74, "תוכנית מקור"],
        [104, 146, "תוכנית מעודכנת"],
        [156, 186, "שתיהן יחד"],
      ]),
    ],
  },
  {
    // Both at 50%, zoomed on the changed walls; revision hidden ~23.5 s, back ~25 s.
    step: 0,
    spec: {
      src: "compare-extended.mp4",
      from: 19.8,
      to: 26.6,
      rate: 1.35,
      cam: [
        [0, 730, 480, 1.1],
        [30, 800, 545, 1.75],
        [151, 800, 545, 1.8],
      ],
    },
    overlays: [
      captions([
        [8, 80, "שתי תוכניות. אחת על השנייה."],
        [112, 160, "רואים מיד מה השתנה."],
      ]),
    ],
  },
  {
    // Divider: centre -> left (~35 s) -> across the moved wall (~39.5 s) -> heading right.
    step: 1,
    spec: {
      src: "compare-extended.mp4",
      from: 31.3,
      to: 41.6,
      rate: 1.5,
      cam: [
        [0, 950, 480, 1.1],
        [30, 950, 480, 1.25],
        [206, 950, 480, 1.28],
      ],
    },
  },
  {
    // Demolition rectangle lands at ~60.5 s.
    step: 2,
    spec: {
      src: "compare-extended.mp4",
      from: 58.3,
      to: 63.6,
      cam: [
        [0, 800, 500, 1.1],
        [30, ...WALL],
        [159, 708, 560, 2.03],
      ],
    },
    overlays: [changeTags(66, 10000)],
  },
  {
    // New construction lands at ~69.5 s; hold on both.
    step: 2,
    spec: {
      src: "compare-extended.mp4",
      from: 67.6,
      to: 72.2,
      cam: [
        [0, 708, 560, 2.03],
        [138, 708, 560, 2.06],
      ],
    },
    overlays: [changeTags(-100, 58)],
  },
  {
    // Changes panel opens at ~74 s; pull back to full width — types sit on the right, areas on the left.
    step: 3,
    fadeIn: false,
    spec: {
      src: "compare-extended.mp4",
      from: 72.2,
      to: 78.2,
      cam: [
        [0, 708, 560, 2.06],
        [30, 708, 560, 2.06],
        [76, ...FULL],
        [180, 800, 740, 1.03],
      ],
    },
    overlays: [
      changeTags(-100, -100, 24),
      captions([[84, 180, "השינויים הופכים לכמויות עבודה"]], "top"),
    ],
  },
  {
    // Export menu opens ~80.0 s, item hovered ~83 s, clicked ~84.5 s.
    step: 4,
    spec: {
      src: "compare-extended.mp4",
      from: 79.6,
      to: 84.8,
      cam: [
        [0, ...FULL],
        [20, ...EXPORT_MENU],
        [156, 250, 210, 2.0],
      ],
    },
    overlays: [captions([[30, 154, "דוח השוואה ל-PDF"]])],
  },
  {
    step: 4,
    report: {
      title: "דוח השינויים מוכן",
      formats: ["PDF"],
      frames: 90,
      sheets: [
        { src: "cmp-1.png", x: 44, y: 172, width: 700, aspect: 1918 / 2400 },
        { src: "cmp-2.png", x: 716, y: 340, width: 680, aspect: 600 / 2400 },
      ],
    },
  },
];

const SCENE_FADE = 16;

export const SCENES = {
  intro: 108,
  qto: demoSceneFrames(QTO_CLIPS),
  bridge: 72,
  compare: demoSceneFrames(COMPARE_CLIPS),
  end: 195,
};

export const LAUNCH_FRAMES =
  SCENES.intro +
  SCENES.qto +
  SCENES.bridge +
  SCENES.compare +
  SCENES.end -
  4 * SCENE_FADE;

const sceneFade = fade();
const sceneTiming = linearTiming({ durationInFrames: SCENE_FADE });

export const LaunchVideo: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={SCENES.intro}>
      <Intro />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={sceneFade} timing={sceneTiming} />
    <TransitionSeries.Sequence durationInFrames={SCENES.qto}>
      <DemoScene eyebrow="חישוב כמויות" steps={QTO_STEPS} clips={QTO_CLIPS} />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={sceneFade} timing={sceneTiming} />
    <TransitionSeries.Sequence durationInFrames={SCENES.bridge}>
      <Bridge />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={sceneFade} timing={sceneTiming} />
    <TransitionSeries.Sequence durationInFrames={SCENES.compare}>
      <DemoScene
        eyebrow="השוואת תוכניות"
        steps={COMPARE_STEPS}
        clips={COMPARE_CLIPS}
      />
    </TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={sceneFade} timing={sceneTiming} />
    <TransitionSeries.Sequence durationInFrames={SCENES.end}>
      <EndCard />
    </TransitionSeries.Sequence>
  </TransitionSeries>
);
