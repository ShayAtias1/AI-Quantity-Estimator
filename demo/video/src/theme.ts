import { loadFont } from "@remotion/google-fonts/Heebo";

// BetterCalc's own tokens (src/index.css in the app), reused so the video reads as the product.
export const C = {
  stage: "#e7e9ee",
  stageLight: "#f4f5f8",
  surface: "#ffffff",
  text: "#3f4654",
  heading: "#0f172a",
  muted: "#6b7280",
  border: "#e3e5ea",
  borderStrong: "#cdd1da",
  accent: "#2563eb",
  demolition: "#d4a017",
  construction: "#16a34a",
};

const { fontFamily } = loadFont("normal", {
  weights: ["300", "400", "500", "700"],
  subsets: ["hebrew", "latin"],
});

export const FONT = fontFamily;

export const FPS = 30;

// Recordings are 1600×1000; the on-screen app window keeps that 16:10 ratio.
export const SRC_W = 1600;
export const SRC_H = 1000;
export const WIN_W = 1440;
export const WIN_H = 900;
export const WIN_TOP = 150;
