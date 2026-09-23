import { fade } from "@remotion/transitions/fade";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { AppWindow, Backdrop, StepHeader } from "../components/Chrome";
import { Clip, clipFrames, ClipSpec } from "../components/Clip";
import { ReportSheets, ReportSpec } from "../components/ReportSheets";

export const CLIP_FADE = 8;

export type SceneClip = {
  /** Index of the header step this clip illustrates. */
  step: number;
  /** Crossfade into this clip; false = hard cut (use for continuous source ranges). */
  fadeIn?: boolean;
  overlays?: React.FC<{ spec: ClipSpec }>[];
} & ({ spec: ClipSpec; report?: never } | { report: ReportSpec; spec?: never });

const framesOf = (c: SceneClip) => (c.spec ? clipFrames(c.spec) : c.report!.frames);

const clipStarts = (clips: SceneClip[]) => {
  const starts: number[] = [];
  let t = 0;
  clips.forEach((c, i) => {
    if (i > 0 && c.fadeIn !== false) t -= CLIP_FADE;
    starts.push(t);
    t += framesOf(c);
  });
  return { starts, total: t };
};

export const demoSceneFrames = (clips: SceneClip[]) => clipStarts(clips).total;

export const DemoScene: React.FC<{
  eyebrow: string;
  steps: string[];
  clips: SceneClip[];
}> = ({ eyebrow, steps, clips }) => {
  const frame = useCurrentFrame();
  const { starts } = clipStarts(clips);
  const changes = steps.map((_, i) => {
    const idx = clips.findIndex((c) => c.step === i);
    return idx <= 0 ? 0 : starts[idx] + CLIP_FADE / 2;
  });

  const rise = interpolate(frame, [0, 28], [24, 0], {
    easing: Easing.bezier(0.2, 0, 0, 1),
    extrapolateRight: "clamp",
  });

  return (
    <Backdrop>
      <StepHeader eyebrow={eyebrow} steps={steps} changes={changes} />
      <div style={{ transform: `translateY(${rise}px)` }}>
        <AppWindow>
          <TransitionSeries>
            {clips.flatMap((c, i) => {
              const seq = (
                <TransitionSeries.Sequence key={`s${i}`} durationInFrames={framesOf(c)}>
                  {c.spec ? (
                    <Clip spec={c.spec}>
                      {c.overlays?.map((O, j) => <O key={j} spec={c.spec!} />)}
                    </Clip>
                  ) : (
                    <ReportSheets report={c.report!} />
                  )}
                </TransitionSeries.Sequence>
              );
              return i > 0 && c.fadeIn !== false
                ? [
                    <TransitionSeries.Transition
                      key={`t${i}`}
                      presentation={fade()}
                      timing={linearTiming({ durationInFrames: CLIP_FADE })}
                    />,
                    seq,
                  ]
                : [seq];
            })}
          </TransitionSeries>
        </AppWindow>
      </div>
    </Backdrop>
  );
};
