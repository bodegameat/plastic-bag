export type SampleType = "vocal" | "loop" | "texture";

export interface SampleDef {
  id: string;
  file: string;
  beats: number;
  type: SampleType;
  label?: string;
  pitchSemitones?: number;
}

export interface AudioManifest {
  tempo: number;
  samples: SampleDef[];
}

export type WorldId =
  | "suburban"
  | "fields"
  | "overpass"
  | "city"
  | "fair"
  | "parking"
  | "horizon";

export interface AudioState {
  altitude: number;
  windSpeed: number;
  snagged: boolean;
  worldId: WorldId;
}

export interface WorldAudioTable {
  vocalDensity: number;
  loopChance: number;
  textureChance: number;
  glitchChance: number;
  reverbWet: number;
}
