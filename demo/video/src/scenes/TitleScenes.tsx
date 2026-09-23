import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop, Wordmark } from "../components/Chrome";
import { C, FONT } from "../theme";

const out = Easing.bezier(0.2, 0, 0, 1);

const reveal = (frame: number, at: number, dur = 22) =>
  interpolate(frame, [at, at + dur], [0, 1], {
    easing: out,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Rise: React.FC<{
  at: number;
  children: React.ReactNode;
  distance?: number;
  style?: React.CSSProperties;
}> = ({ at, children, distance = 18, style }) => {
  const t = reveal(useCurrentFrame(), at);
  return (
    <div
      style={{
        opacity: t,
        transform: `translateY(${(1 - t) * distance}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// A schematic apartment, drawn in thin wall lines — a quiet nod to the plans the product reads.
const WALLS = [
  "M0 0 H1000 V560 H0 Z",
  "M330 0 V560",
  "M0 250 H330",
  "M560 0 V250",
  "M790 0 V250",
  "M330 250 H1000",
  "M690 250 V560",
  "M330 400 H520",
  "M860 400 H1000",
];

const PlanLines: React.FC<{ start: number; opacity?: number }> = ({
  start,
  opacity = 0.09,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        // Keep the lines out from under the type.
        maskImage:
          "radial-gradient(ellipse 42% 30% at 50% 50%, transparent 72%, black 100%)",
      }}
    >
      <svg width={1300} height={728} viewBox="-10 -10 1020 580" style={{ opacity }}>
        {WALLS.map((d, i) => {
          const t = interpolate(frame, [start + i * 4, start + i * 4 + 50], [0, 1], {
            easing: Easing.bezier(0.45, 0, 0.2, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <path
              key={d}
              d={d}
              pathLength={1}
              fill="none"
              stroke={C.heading}
              strokeWidth={i === 0 ? 7 : 4}
              strokeDasharray="1 1"
              strokeDashoffset={1 - t}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      direction: "rtl",
      fontFamily: FONT,
      textAlign: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Intro: React.FC = () => (
  <Backdrop>
    <PlanLines start={0} />
    <Center>
      <Rise at={8} distance={14}>
        <Wordmark size={128} />
      </Rise>
      <Rise at={34} style={{ marginTop: 44 }}>
        <div style={{ fontSize: 50, fontWeight: 400, color: C.heading }}>
          מתוכנית PDF לכמויות.{" "}
          <span style={{ fontWeight: 700 }}>בלי CAD.</span>
        </div>
      </Rise>
    </Center>
  </Backdrop>
);

export const Bridge: React.FC = () => (
  <Backdrop>
    <Center>
      <Rise at={6}>
        <div style={{ fontSize: 76, fontWeight: 500, color: C.heading }}>
          והתוכנית השתנתה?
        </div>
      </Rise>
      <Rise at={28} style={{ marginTop: 30 }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 500,
            color: C.accent,
            letterSpacing: 0.5,
          }}
        >
          השוואת תוכניות
        </div>
      </Rise>
    </Center>
  </Backdrop>
);

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const rule = reveal(frame, 40, 30);
  return (
    <Backdrop>
      <PlanLines start={0} opacity={0.06} />
      <Center>
        <Rise at={6} distance={14}>
          <Wordmark size={112} />
        </Rise>
        <Rise at={22} style={{ marginTop: 40 }}>
          <div style={{ fontSize: 46, fontWeight: 400, color: C.heading }}>
            חישוב כמויות והשוואת תוכניות ישירות מ-PDF
          </div>
        </Rise>
        <div
          style={{
            marginTop: 56,
            marginBottom: 48,
            width: 120 * rule,
            height: 2,
            backgroundColor: C.accent,
            opacity: 0.85,
          }}
        />
        <Rise at={52}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 400,
              color: C.text,
              maxWidth: 1100,
              lineHeight: 1.5,
            }}
          >
            מחפש אנשי מקצוע מהתחום שינסו את BetterCalc ויתנו פידבק.
          </div>
        </Rise>
      </Center>
    </Backdrop>
  );
};
