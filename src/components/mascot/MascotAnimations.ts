/**
 * Plays the mascot's clips from the shared state with cross-fades, so any clip can follow any other
 * (Idle → Walk → Point → Idle) without pops. One-shots (Wave, Jump...) hand back to the looping clip
 * that was playing, or to the one the controller asked for.
 */
import * as THREE from "three";
import { mascot } from "@/hooks/useMascotState";
import { ONE_SHOT, type ClipName } from "@/lib/mascot/clip-names";

const FADE: Partial<Record<ClipName, number>> = { Walk: 0.25, Run: 0.2, Jump: 0.15, Celebrate: 0.2, Dance: 0.3, Sleep: 0.8, Sit: 0.6 };

export function bindAnimations(model: THREE.Object3D, clips: THREE.AnimationClip[], onChange: () => void) {
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(clips.map((c) => [c.name, mixer.clipAction(c)]));
  let current: THREE.AnimationAction | null = null;
  let lastId = -1;

  const apply = () => {
    const s = mascot.get();
    if (s.clipId === lastId && current) return;
    lastId = s.clipId;
    const next = actions.get(s.clip);
    if (!next) return;
    const once = ONE_SHOT.has(s.clip);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.play();
    if (current && current !== next) next.crossFadeFrom(current, FADE[s.clip] ?? 0.4, false);
    current = next;
    onChange();
  };

  const finished = (e: { action: THREE.AnimationAction }) => {
    if (e.action !== current) return;
    const s = mascot.get();
    if (ONE_SHOT.has(s.clip)) mascot.play(s.rest);
  };
  mixer.addEventListener("finished", finished);
  apply();
  const unsubscribe = mascot.subscribe(apply);

  return {
    mixer,
    dispose() {
      unsubscribe();
      mixer.removeEventListener("finished", finished);
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    },
  };
}
