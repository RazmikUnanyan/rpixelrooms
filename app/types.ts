export type RecordingState = 'idle' | 'recording' | 'waiting';
export type ExportFormat = 'landscape' | 'portrait_9_16';
export type MusicMode = 'mix' | 'replace';
export type SlideType = 'image' | 'custom' | 'color';

export interface ScheduleEntry {
  id: string;
  startOffset: number;
  duration: number;
  label: string;
}

export interface RecordedClip {
  id: string;
  blob: Blob;
  url: string;
  startOffset: number;
  duration: number;
  label: string;
  savedPath?: string;
}

export interface SessionConfig {
  sessionName: string;
  totalDuration: number;
  schedule: ScheduleEntry[];
  resolution: '480p' | '720p' | '1080p';
  framerate: 24 | 30 | 60;
  selectedDeviceId: string | null;
}

export interface VideoDevice {
  deviceId: string;
  label: string;
}

export interface SlideConfig {
  enabled: boolean;
  type: SlideType;
  filePath?: string;
  fileDataUrl?: string;
  color: string;
  text: string;
  duration: number;
}

export interface MusicConfig {
  enabled: boolean;
  filePath?: string;
  fileName?: string;
  mode: MusicMode;
  volume: number;
}

export interface ExportSettings {
  format: ExportFormat;
  intro: SlideConfig;
  outro: SlideConfig;
  music: MusicConfig;
}

declare global {
  interface Window {
    electronAPI?: {
      saveTempClip: (buf: ArrayBuffer, id: string) => Promise<{ ok: boolean; filePath?: string }>;
      pickFile: (filters: { name: string; extensions: string[] }[], title: string) => Promise<{ ok: boolean; filePath?: string }>;
      pickDirectory: (title?: string) => Promise<{ ok: boolean; filePath?: string }>;
      getDefaultAssets: () => Promise<{ introPath: string; outroPath: string; defaultExportDir: string }>;
      exportVideo: (opts: any) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      onFfmpegProgress: (cb: (data: string) => void) => () => void;
      showInFolder: (filePath: string) => Promise<{ ok: boolean }>;
      getAppVersion: () => Promise<string>;
      platform: string;
    };
  }
}
