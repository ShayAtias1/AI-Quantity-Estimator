import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, FONT } from "../theme";

export type SheetSpec = {
  /** File under public/reports/ — a real page exported by BetterCalc. */
  src: string;
  x: number;
  y: number;
  width: number;
  /** Source aspect (height / width) of the rendered page crop. */
  aspect: number;
};

export type ReportSpec = {
  title: string;
  formats: string[];
  sheets: SheetSpec[];
  frames: number;
};

const ease = Easing.bezier(0.2, 0, 0, 1);

const Chip: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: 22,
      fontWeight: 500,
      color: C.accent,
      padding: "6px 16px",
      borderRadius: 999,
      backgroundColor: "rgba(37,99,235,0.09)",
      boxShadow: "inset 0 0 0 1px rgba(37,99,235,0.25)",
      direction: "ltr",
    }}
  >
    {label}
  </div>
);

/** The actual exported report pages, laid out as paper sheets inside the app window. */
export const ReportSheets: React.FC<{ report: ReportSpec }> = ({ report }) => {
  const frame = useCurrentFrame();
  const head = interpolate(frame, [4, 22], [0, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const drift = interpolate(frame, [0, report.frames], [1, 1.025]);

  return (
    <AbsoluteFill style={{ backgroundColor: C.stageLight, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 52,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 18,
          direction: "rtl",
          opacity: head,
          transform: `translateY(${(1 - head) * 10}px)`,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 36,
            fontWeight: 500,
            color: C.heading,
          }}
        >
          {report.title}
        </div>
        {report.formats.map((f) => (
          <Chip key={f} label={f} />
        ))}
      </div>
      <AbsoluteFill style={{ transform: `scale(${drift})` }}>
        {report.sheets.map((s, i) => {
          const t = interpolate(frame, [4 + i * 10, 24 + i * 10], [0, 1], {
            easing: ease,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div
              key={s.src}
              style={{
                position: "absolute",
                left: s.x,
                top: s.y,
                width: s.width,
                height: s.width * s.aspect,
                backgroundColor: "#fff",
                borderRadius: 4,
                overflow: "hidden",
                opacity: t,
                transform: `translateY(${(1 - t) * 26}px)`,
                boxShadow:
                  "0 0 0 1px rgba(15,23,42,0.07), 0 24px 50px -20px rgba(15,23,42,0.35)",
              }}
            >
              <Img
                src={staticFile(`reports/${s.src}`)}
                style={{ width: "100%", height: "100%", display: "block" }}
              />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
