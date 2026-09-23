import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { C, FONT, WIN_H, WIN_TOP, WIN_W } from "../theme";

/** Quiet architectural backdrop: BetterCalc's stage grey with a faint drafting grid. */
export const Backdrop: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: C.stage,
      backgroundImage: [
        "radial-gradient(ellipse at 50% 40%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 70%)",
        "linear-gradient(rgba(15,23,42,0.035) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(15,23,42,0.035) 1px, transparent 1px)",
        "linear-gradient(rgba(15,23,42,0.025) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(15,23,42,0.025) 1px, transparent 1px)",
      ].join(","),
      backgroundSize: "100% 100%, 240px 240px, 240px 240px, 48px 48px, 48px 48px",
      backgroundPosition: "0 0, 0 0, 0 0, 0 0, 0 0",
      fontFamily: FONT,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Wordmark: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => (
  <div
    style={{
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: -size * 0.025,
      color: C.heading,
      direction: "ltr",
      lineHeight: 1,
      ...style,
    }}
  >
    Better<span style={{ color: C.accent }}>Calc</span>
  </div>
);

/** The framed app window the recordings play inside. */
export const AppWindow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      left: (1920 - WIN_W) / 2,
      top: WIN_TOP,
      width: WIN_W,
      height: WIN_H,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: "#fff",
      boxShadow:
        "0 0 0 1px rgba(15,23,42,0.08), 0 30px 70px -20px rgba(15,23,42,0.28), 0 10px 24px -12px rgba(15,23,42,0.18)",
    }}
  >
    {children}
  </div>
);

const stepEase = Easing.bezier(0.33, 0, 0.2, 1);

/**
 * Header above the window: section eyebrow + a numbered progression of steps, RTL.
 * `changes[i]` is the frame at which step i becomes active.
 */
export const StepHeader: React.FC<{
  eyebrow: string;
  steps: string[];
  changes: number[];
  accent?: Record<number, React.ReactNode>;
}> = ({ eyebrow, steps, changes, accent }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [4, 24], [0, 1], {
    easing: stepEase,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: (1920 - WIN_W) / 2,
        width: WIN_W,
        height: WIN_TOP,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        direction: "rtl",
        fontFamily: FONT,
        opacity: enter,
        transform: `translateY(${(1 - enter) * -10}px)`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            fontSize: 21,
            fontWeight: 500,
            color: C.accent,
            letterSpacing: 0.5,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {steps.map((label, i) => {
            const on = (f: number) =>
              interpolate(frame, [f, f + 10], [0, 1], {
                easing: stepEase,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
            const reached = on(changes[i]);
            const passed = i + 1 < changes.length ? on(changes[i + 1]) : 0;
            const active = reached * (1 - passed);
            const opacity = 0.38 + 0.62 * active + 0.22 * passed;
            return (
              <React.Fragment key={label}>
                {i > 0 && (
                  <div
                    style={{
                      width: 22,
                      height: 1.5,
                      backgroundColor: C.borderStrong,
                      opacity: 0.9,
                    }}
                  />
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      fontWeight: 500,
                      color: active > 0.5 ? "#fff" : C.heading,
                      backgroundColor: `rgba(37,99,235,${active})`,
                      boxShadow: `inset 0 0 0 1.5px ${active > 0.5 ? C.accent : C.borderStrong}`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: active > 0.5 ? 500 : 400,
                      color: C.heading,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </div>
                  {accent?.[i] && (
                    <div style={{ opacity: active }}>{accent[i]}</div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
      <Wordmark size={30} style={{ opacity: 0.9 }} />
    </div>
  );
};
