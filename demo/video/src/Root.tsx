import { Composition } from "remotion";
import { LAUNCH_FRAMES, LaunchVideo } from "./LaunchVideo";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="BetterCalcLaunch"
    component={LaunchVideo}
    durationInFrames={LAUNCH_FRAMES}
    fps={FPS}
    width={1920}
    height={1080}
  />
);
