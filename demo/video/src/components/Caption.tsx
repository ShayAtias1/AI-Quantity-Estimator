import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { ClipSpec } from "./Clip";

/** [clip-local from frame, to frame, text] */
export type CaptionCue = [number, number, string];

const FADE = 10;

/** A short line of copy in a quiet pill at the bottom of the app window. */
export const captions = (cues: CaptionCue[], position: "top" | "bottom" = "bottom") => {
  const Overlay: React.FC<{ spec: ClipSpec }> = () => {
    const frame = useCurrentFrame();
    return (
      <>
        {cues.map(([from, to, text]) => {
          const t = interpolate(
            frame,
            [from, from + FADE, to - FADE, to],
            [0, 1, 1, 0],
            {
              easing: Easing.bezier(0.33, 0, 0.2, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            },
          );
          if (t <= 0) return null;
          return (
            <div
              key={`${from}-${text}`}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                ...(position === "top" ? { top: 96 } : { bottom: 44 }),
                display: "flex",
                justifyContent: "center",
                opacity: t,
                transform: `translateY(${(1 - t) * 10}px)`,
              }}
            >
              <div
                style={{
                  direction: "rtl",
                  fontFamily: FONT,
                  fontSize: 34,
                  fontWeight: 500,
                  color: C.heading,
                  padding: "14px 30px",
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.95)",
                  boxShadow:
                    "0 0 0 1px rgba(15,23,42,0.08), 0 14px 34px -12px rgba(15,23,42,0.35)",
                  whiteSpace: "nowrap",
                }}
              >
                {text}
              </div>
            </div>
          );
        })}
      </>
    );
  };
  return Overlay;
};
