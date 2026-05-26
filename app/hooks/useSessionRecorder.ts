'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { SessionConfig, RecordedClip, RecordingState, ScheduleEntry, VideoDevice } from '../types';
import { nanoid, getSupportedMimeType } from '../utils';

export function useSessionRecorder(config: SessionConfig) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<RecordingState>('idle');
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [clipElapsed, setClipElapsed] = useState(0);
  const [clips, setClips] = useState<RecordedClip[]>([]);
  const [activeClipDuration, setActiveClipDuration] = useState(0);
  const [activeClipLabel, setActiveClipLabel] = useState('');
  const [sessionStarted, setSessionStarted] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clipTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduleTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clipStartRef = useRef<number>(0);
  const sessionElapsedRef = useRef(0);
  const clipsCountRef = useRef(0);

  // ── Device enumeration ───────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      // Trigger permission prompt so labels become available
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      tmp.getTracks().forEach(t => t.stop());
    } catch { /* permission denied — continue to enumerate anyway */ }

    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const video = all
        .filter(d => d.kind === 'videoinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || `Камера ${d.deviceId.slice(0, 8)}`,
        }));
      setDevices(video);
    } catch (e) {
      notifications.show({ title: 'Ошибка устройств', message: String(e), color: 'red' });
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  // ── Open camera ──────────────────────────────────────────────────────────
  const openCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (!config.selectedDeviceId) {
      notifications.show({ title: 'Камера не выбрана', message: 'Выберите USB-камеру из списка', color: 'yellow' });
      return null;
    }

    const resMap = { '480p': [854, 480], '720p': [1280, 720], '1080p': [1920, 1080] } as const;
    const [w, h] = resMap[config.resolution];

    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: config.selectedDeviceId }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: config.framerate } },
        audio: true,
      });
      setStream(s);
      streamRef.current = s;
      return s;
    } catch (err: any) {
      notifications.show({
        title: 'Ошибка камеры',
        message: err?.message ?? 'Не удалось открыть устройство',
        color: 'red',
      });
      return null;
    }
  }, [config.selectedDeviceId, config.resolution, config.framerate]);

  // ── Record one clip ──────────────────────────────────────────────────────
  const startClip = useCallback((entry: ScheduleEntry, s: MediaStream) => {
    chunksRef.current = [];
    clipStartRef.current = Date.now();
    setActiveClipDuration(entry.duration);
    setActiveClipLabel(entry.label);
    setClipElapsed(0);
    setState('recording');

    const mr = new MediaRecorder(s, { mimeType: getSupportedMimeType() });
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const duration = (Date.now() - clipStartRef.current) / 1000;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const clip: RecordedClip = { id: nanoid(), blob, url, startOffset: entry.startOffset, duration, label: entry.label };

      clipsCountRef.current += 1;
      setClips(prev => [...prev, clip]);

      // Background save to temp
      if (window.electronAPI) {
        blob.arrayBuffer().then(buf => window.electronAPI!.saveTempClip(buf, clip.id));
      }

      notifications.show({ title: 'Клип сохранён', message: `"${entry.label}"`, color: 'cyan', autoClose: 2500 });
    };

    mr.start(300);
    mediaRecorderRef.current = mr;

    if (entry.duration > 0) {
      let elapsed = 0;
      clipTimerRef.current = setInterval(() => {
        elapsed += 1;
        setClipElapsed(elapsed);
        if (elapsed >= entry.duration) stopClip();
      }, 1000);
    }
  }, []);

  const stopClip = useCallback(() => {
    if (clipTimerRef.current) { clearInterval(clipTimerRef.current); clipTimerRef.current = null; }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
    setState('waiting');
    setClipElapsed(0);
    setActiveClipDuration(0);
    setActiveClipLabel('');
  }, []);

  // ── Start session ────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    const s = await openCamera();
    if (!s) return;

    sessionElapsedRef.current = 0;
    setSessionElapsed(0);
    setClips([]);
    clipsCountRef.current = 0;
    setSessionStarted(true);
    setState('waiting');

    if (config.schedule.length > 0) {
      const tos = config.schedule.map(entry =>
        setTimeout(() => startClip(entry, s), entry.startOffset * 1000)
      );
      scheduleTimeoutsRef.current = tos;
    }

    let elapsed = 0;
    sessionTimerRef.current = setInterval(() => {
      elapsed += 1;
      sessionElapsedRef.current = elapsed;
      setSessionElapsed(elapsed);
      if (config.totalDuration > 0 && elapsed >= config.totalDuration) {
        endSessionWithStream(s, undefined);
      }
    }, 1000);
  }, [config, openCamera, startClip]);

  // ── End session ──────────────────────────────────────────────────────────
  const endSessionWithStream = useCallback((s: MediaStream, onEnd?: () => void) => {
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
    if (clipTimerRef.current) { clearInterval(clipTimerRef.current); clipTimerRef.current = null; }
    scheduleTimeoutsRef.current.forEach(clearTimeout);
    scheduleTimeoutsRef.current = [];

    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      // Wait for onstop to fire (last clip saved) before calling onEnd
      const originalOnStop = mr.onstop;
      mr.onstop = (e) => {
        if (originalOnStop) (originalOnStop as any)(e);
        // Give React one more tick to flush the setClips call inside onstop
        setTimeout(() => onEnd?.(), 100);
      };
      mr.stop();
    } else {
      onEnd?.();
    }

    s.getTracks().forEach(t => t.stop());
    setStream(null);
    streamRef.current = null;
    setState('idle');
    setSessionStarted(false);
    setActiveClipDuration(0);
    setClipElapsed(0);
  }, []);

  const endSession = useCallback((onEnd?: () => void) => {
    const s = streamRef.current;
    if (s) endSessionWithStream(s, onEnd);
    else onEnd?.();
  }, [endSessionWithStream]);

  // ── Manual record toggle ─────────────────────────────────────────────────
  const toggleRecord = useCallback(() => {
    const s = streamRef.current;
    if (!s) return;
    if (state === 'recording') {
      stopClip();
    } else {
      startClip({
        id: nanoid(),
        startOffset: sessionElapsedRef.current,
        duration: 0,
        label: `Клип ${clipsCountRef.current + 1}`,
      }, s);
    }
  }, [state, startClip, stopClip]);

  const removeClip = useCallback((id: string) => {
    setClips(prev => {
      const c = prev.find(x => x.id === id);
      if (c) URL.revokeObjectURL(c.url);
      return prev.filter(x => x.id !== id);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
      if (clipTimerRef.current) clearInterval(clipTimerRef.current);
      scheduleTimeoutsRef.current.forEach(clearTimeout);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return {
    stream, state, sessionElapsed, clipElapsed, clips,
    activeClipDuration, activeClipLabel, sessionStarted,
    devices, loadingDevices, refreshDevices,
    startSession, endSession, toggleRecord, removeClip,
  };
}
