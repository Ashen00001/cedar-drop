export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat extends Vec3 {
  w: number;
}

export type Surface = 'dirt' | 'grass' | 'rock';
export type LandingGrade = 'perfect' | 'clean' | 'sketchy';

export interface LandEvent {
  type: 'land';
  air: number;
  flips: number;
  spins: number;
  fakie: boolean;
  clean: boolean;
  grade: LandingGrade;
  impact: number;
  thRel: number;
}

export type BikeEvent =
  | { type: 'takeoff' }
  | { type: 'hop' }
  | { type: 'whip' }
  | { type: 'near' }
  | { type: 'bail'; reason: string }
  | { type: 'tweak'; name: string; idx: number; time: number }
  | LandEvent;

export interface PadInfo {
  id: string;
  mapping: string;
  axes: string[];
  buttons: number[];
}

export interface Inputs {
  throttle: number;
  brake: number;
  steer: number;
  steerRaw: number;
  lean: number;
  flip: number;
  kbFlip: boolean;
  bodyY: number;
  bodyX: number;
  trickX: number;
  trickY: number;
  hop: boolean;
  hopTap: boolean;
  respawn: boolean;
  cam: boolean;
  pause: boolean;
  mute: boolean;
  debug: boolean;
  confirm: boolean;
  pad: PadInfo | null;
}

export interface Score {
  score: number;
  combo: number;
  mult: number;
  timer: number;
  best: number;
  dist: number;
  top: number;
  bails: number;
  used: Record<string, number>;
}

export interface Ui {
  popup(title: string, sub?: string, bad?: boolean, mini?: boolean): void;
}

export interface TreeObstacle {
  tree: true;
  id: number;
  x: number;
  z: number;
  s: number;
  w: number;
  h: number;
  c: number;
  rot: number;
  r: number;
}

export interface RockObstacle {
  tree: false;
  id: number;
  x: number;
  z: number;
  s: number;
  a: number;
  r: number;
}

export type Obstacle = TreeObstacle | RockObstacle;

export interface Feature {
  idx: number;
  s: number;
  type: number;
  name: string;
  H: number;
  L: number;
  start: number;
  len: number;
}
