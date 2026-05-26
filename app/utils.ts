export function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function mergeWebmBlobs(blobs: Blob[]): Promise<Blob> {
  // Sequential WebM concatenation — valid for same-codec, continuous streams
  return new Blob(blobs, { type: 'video/webm' });
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=h264,opus',
    'video/webm',
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) ?? 'video/webm';
}
