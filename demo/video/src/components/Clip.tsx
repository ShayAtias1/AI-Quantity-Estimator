import { Video } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Freeze,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { FPS, SRC_H, SRC_W, WIN_H, WIN_W } from "../theme";

/** Camera keyframe: [clip-local frame, focus x, focus y (recording px), zoom]. */
export type CamKey = [number, number, number, number];

export type ClipSpec = {
  src: "qto.mp4" | "qto-export.mp4" | "compare-extended.mp4";
  /** Source in/out points, in seconds of the recording. */
  from: number;
  to: number;
  rate?: number;
  /** Frames to hold the last frame after the source range ends. */
  hold?: number;
  cam?: CamKey[];
};

export const clipPlayFrames = (c: ClipSpec) =>
  Math.round(((c.to - c.from) * FPS) / (c.rate ?? 1));

export const clipFrames = (c: ClipSpec) => clipPlayFrames(c) + (c.hold ?? 0);

const ease = Easing.bezier(0.45, 0, 0.2, 1);

const camAt = (keys: CamKey[], f: number) => {
  if (keys.length === 1) return keys[0].slice(1) as [number, number, number];
  const frames = keys.map((k) => k[0]);
  const pick = (i: number) =>
    interpolate(
      f,
      frames,
      keys.map((k) => k[i]),
      { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
  return [pick(1), pick(2), pick(3)] as [number, number, number];
};

/** Camera transform at a clip-local frame: window-space translate + scale. */
export const cameraAt = (spec: ClipSpec, frame: number) => {
  const [cx, cy, zoom] = camAt(spec.cam ?? [[0, SRC_W / 2, SRC_H / 2, 1]], frame);
  const k = WIN_W / SRC_W;
  const s = Math.max(1, zoom);
  const tx = Math.min(0, Math.max(WIN_W - WIN_W * s, WIN_W / 2 - cx * k * s));
  const ty = Math.min(0, Math.max(WIN_H - WIN_H * s, WIN_H / 2 - cy * k * s));
  /** Recording px -> window px under this camera. */
  const project = (x: number, y: number) => ({ x: tx + x * k * s, y: ty + y * k * s });
  return { tx, ty, s, project };
};

/**
 * One trimmed stretch of a recording, filling the app window, with an eased crop/zoom path.
 * The focus point is kept centred but clamped so the frame never reveals past the recording edge.
 */
export const Clip: React.FC<{ spec: ClipSpec; children?: React.ReactNode }> = ({
  spec,
  children,
}) => {
  const frame = useCurrentFrame();
  const play = clipPlayFrames(spec);
  const { tx, ty, s } = cameraAt(spec, frame);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#fff" }}>
      <div
        style={{
          position: "absolute",
          width: WIN_W,
          height: WIN_H,
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        }}
      >
        <Freeze frame={play - 1} active={(f) => f >= play}>
          <Video
            src={staticFile(spec.src)}
            trimBefore={Math.round(spec.from * FPS)}
            playbackRate={spec.rate ?? 1}
            muted
            style={{ width: WIN_W, height: WIN_H }}
          />
        </Freeze>
      </div>
      {children}
    </AbsoluteFill>
  );
};
