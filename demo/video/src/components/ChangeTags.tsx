import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { cameraAt, ClipSpec } from "./Clip";

// The two change markers in compare-demo: the original partition wall between the bedrooms
// (marked demolition) and the revised wall a little to its left in screen terms (new construction).
const DEMOLITION_X = 697;
const CONSTRUCTION_X = 718;

const pop = (frame: number, at: number) =>
  interpolate(frame, [at, at + 12], [0, 1], {
    easing: Easing.bezier(0.2, 0, 0, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Tag: React.FC<{
  x: number;
  y: number;
  side: "left" | "right";
  color: string;
  label: string;
  t: number;
}> = ({ x, y, side, color, label, t }) => {
  const gap = 22;
  return (
    <div
      style={{
        position: "absolute",
        top: y,
        ...(side === "left"
          ? { right: 1440 - x + gap }
          : { left: x + gap }),
        transform: `translateY(-50%) translateX(${(1 - t) * (side === "left" ? 12 : -12)}px)`,
        opacity: t,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 16px 9px 18px",
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.96)",
        boxShadow:
          "0 0 0 1px rgba(15,23,42,0.08), 0 8px 22px -8px rgba(15,23,42,0.28)",
        direction: "rtl",
        fontFamily: FONT,
        fontSize: 24,
        fontWeight: 500,
        color: C.heading,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
        }}
      />
      {label}
    </div>
  );
};

/** Labels the demolition / new-construction markers while the camera is zoomed on them. */
export const changeTags = (demolitionAt: number, constructionAt: number, outAt?: number) => {
  const Overlay: React.FC<{ spec: ClipSpec }> = ({ spec }) => {
    const frame = useCurrentFrame();
    const cam = cameraAt(spec, frame);
    const out =
      outAt === undefined
        ? 1
        : interpolate(frame, [outAt, outAt + 10], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
    // Just below the bedrooms' top wall, clear of the room labels.
    const d = cam.project(DEMOLITION_X - 6, 472);
    const c = cam.project(CONSTRUCTION_X + 6, 472);
    return (
      <>
        <Tag
          x={d.x}
          y={d.y}
          side="left"
          color={C.demolition}
          label="הריסה"
          t={pop(frame, demolitionAt) * out}
        />
        <Tag
          x={c.x}
          y={c.y}
          side="right"
          color={C.construction}
          label="בנייה חדשה"
          t={pop(frame, constructionAt) * out}
        />
      </>
    );
  };
  return Overlay;
};
