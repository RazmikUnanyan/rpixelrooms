'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Stack, Paper, Text, Group, Button, Box, Badge,
  SegmentedControl, Switch, TextInput, ColorInput,
  NumberInput, Slider, Progress, ActionIcon, ScrollArea,
} from '@mantine/core';
import {
  IconDownload, IconPhoto, IconMusic,
  IconX, IconUpload, IconCheck,
  IconDeviceTv, IconBrandInstagram,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {RecordedClip, SlideConfig, MusicConfig, ExportSettings} from '../types';
import { formatTime } from '../utils';

const DEFAULT_SLIDE: SlideConfig = {
  enabled: false,
  type: 'color',
  color: '#000000',
  text: '',
  duration: 3,
};

const DEFAULT_EXPORT: ExportSettings = {
  format: 'portrait_9_16',
  intro: { ...DEFAULT_SLIDE },
  outro: { ...DEFAULT_SLIDE },
  music: { enabled: false, mode: 'mix', volume: 0.7 },
};

interface Props {
  clips: RecordedClip[];
  sessionName: string;
}

export default function ExportPanel({ clips, sessionName }: Props) {
  const [cfg, setCfg] = useState<ExportSettings>(DEFAULT_EXPORT);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [lastOutput, setLastOutput] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const upd = (patch: Partial<ExportSettings>) => setCfg(p => ({ ...p, ...patch }));
  const updSlide = (key: 'intro' | 'outro', patch: Partial<SlideConfig>) =>
    setCfg(p => ({ ...p, [key]: { ...p[key], ...patch } }));
  const updMusic = (patch: Partial<MusicConfig>) =>
    setCfg(p => ({ ...p, music: { ...p.music, ...patch } }));

  const pickImage = useCallback(async (key: 'intro' | 'outro') => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.pickFile(
      [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      `Select ${key} image`
    );
    if (!res.ok || !res.filePath) return;
    updSlide(key, { filePath: res.filePath, type: 'image', fileDataUrl: `file://${res.filePath}` });
  }, []);

  const pickMusic = useCallback(async () => {
    if (!window.electronAPI) return;
    const res = await window.electronAPI.pickFile(
      [{ name: 'Audio', extensions: ['mp3', 'aac', 'wav', 'm4a', 'ogg'] }],
      'Select music file'
    );
    if (!res.ok || !res.filePath) return;
    const name = res.filePath.split(/[\\/]/).pop() ?? res.filePath;
    updMusic({ filePath: res.filePath, fileName: name, enabled: true });
  }, []);

  const handleExport = async () => {
    if (!window.electronAPI) {
      notifications.show({ title: 'Desktop only', message: 'Export requires the desktop app', color: 'yellow' });
      return;
    }
    if (clips.length === 0) {
      notifications.show({ title: 'No clips', message: 'Record at least one clip first', color: 'yellow' });
      return;
    }

    setExporting(true);
    setProgressPct(0);
    setProgress('Saving clips...');
    setLastOutput(null);

    unsubRef.current = window.electronAPI.onFfmpegProgress((line: string) => {
      if (line.includes('time=')) setProgress(line.trim());
      const m = line.match(/time=(\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]);
        const total = clips.reduce((a, c) => a + c.duration, 0)
          + (cfg.intro.enabled ? cfg.intro.duration : 0)
          + (cfg.outro.enabled ? cfg.outro.duration : 0);
        if (total > 0) setProgressPct(Math.min((secs / total) * 100, 95));
      }
    });

    try {
      const clipPaths: string[] = [];
      for (const clip of clips) {
        if (clip.savedPath) {
          clipPaths.push(clip.savedPath);
        } else {
          const buf = await clip.blob.arrayBuffer();
          const res = await window.electronAPI.saveTempClip(buf, clip.id);
          if (!res.ok || !res.filePath) throw new Error(`Failed to save clip ${clip.label}`);
          clipPaths.push(res.filePath);
        }
      }

      setProgress('Running ffmpeg...');
      setProgressPct(5);

      const defaultName = `${sessionName.replace(/\s+/g, '_')}_${cfg.format}_${Date.now()}`;

      const res = await window.electronAPI.exportVideo({
        clipPaths,
        outputFormat: cfg.format,
        introConfig: cfg.intro.enabled ? cfg.intro : null,
        outroConfig: cfg.outro.enabled ? cfg.outro : null,
        musicConfig: cfg.music.enabled && cfg.music.filePath ? cfg.music : null,
        defaultName,
      });

      if (res.ok && res.filePath) {
        setProgressPct(100);
        setLastOutput(res.filePath);
        notifications.show({ title: 'Export complete', message: res.filePath, color: 'cyan', autoClose: 8000 });
      } else {
        throw new Error(res.error ?? 'Unknown ffmpeg error');
      }
    } catch (e: any) {
      notifications.show({ title: 'Export failed', message: e.message, color: 'red', autoClose: 0 });
      setProgressPct(0);
    } finally {
      setExporting(false);
      setProgress('');
      unsubRef.current?.();
      unsubRef.current = null;
    }
  };

  const totalDuration = clips.reduce((a, c) => a + c.duration, 0);

  return (
    <ScrollArea h="480px">
      <Stack gap="md">
        <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm" style={{ letterSpacing: '0.08em' }}>
            Output format
          </Text>
          <Group grow gap="xs">
            <FormatCard active={cfg.format === 'landscape'} onClick={() => upd({ format: 'landscape' })}
              icon={<IconDeviceTv size={22} />} label="16:9 Landscape" sub="YouTube, Desktop, TV" dims="1920×1080" />
            <FormatCard active={cfg.format === 'portrait_9_16'} onClick={() => upd({ format: 'portrait_9_16' })}
              icon={<IconBrandInstagram size={22} />} label="9:16 Portrait" sub="Reels, TikTok, Stories" dims="1080×1920" />
          </Group>
        </Paper>

        <SlideSection label="Intro slide" config={cfg.intro}
          onChange={p => updSlide('intro', p)} onPickImage={() => pickImage('intro')} badge="At start" />

        <SlideSection label="Outro slide" config={cfg.outro}
          onChange={p => updSlide('outro', p)} onPickImage={() => pickImage('outro')} badge="At end" />

        <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
          <Group justify="space-between" mb={cfg.music.enabled ? 'sm' : 0}>
            <Group gap={6}>
              <IconMusic size={13} color="var(--mantine-color-cyan-4)" />
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>Music</Text>
            </Group>
            <Switch size="xs" checked={cfg.music.enabled}
              onChange={e => updMusic({ enabled: e.currentTarget.checked })} color="cyan" />
          </Group>
          {cfg.music.enabled && (
            <Stack gap="sm">
              <Group gap="xs">
                <Button size="xs" variant="outline" color="cyan"
                  leftSection={<IconUpload size={12} />} onClick={pickMusic} style={{ flex: 1 }}>
                  {cfg.music.fileName ?? 'Choose file...'}
                </Button>
                {cfg.music.fileName && (
                  <ActionIcon size="sm" variant="subtle" color="red"
                    onClick={() => updMusic({ filePath: undefined, fileName: undefined })}>
                    <IconX size={12} />
                  </ActionIcon>
                )}
              </Group>
              <Box>
                <Text size="xs" c="dimmed" mb={4}>Overlay mode</Text>
                <SegmentedControl size="xs" fullWidth value={cfg.music.mode}
                  onChange={v => updMusic({ mode: v as any })}
                  data={[{ label: 'Mix with original', value: 'mix' }, { label: 'Replace audio', value: 'replace' }]}
                  styles={{ label: { fontFamily: 'monospace', fontSize: '11px' } }} />
              </Box>
              <Box>
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">Music volume</Text>
                  <Text size="xs" c="cyan.4" ff="monospace">{Math.round(cfg.music.volume * 100)}%</Text>
                </Group>
                <Slider size="xs" value={cfg.music.volume * 100} onChange={v => updMusic({ volume: v / 100 })}
                  min={0} max={100} step={5} color="cyan" label={null} />
              </Box>
            </Stack>
          )}
        </Paper>

        <Paper withBorder p="md" style={{
          borderColor: clips.length > 0 ? 'var(--mantine-color-cyan-9)' : 'var(--mantine-color-dark-5)',
          background: clips.length > 0 ? 'rgba(12,133,153,0.05)' : undefined,
        }}>
          <Stack gap="sm">
            <Group gap="xs" wrap="wrap">
              <Badge size="xs" variant="outline" color="cyan" ff="monospace">{clips.length} clips</Badge>
              <Badge size="xs" variant="outline" color="gray" ff="monospace">{formatTime(Math.round(totalDuration))}</Badge>
              <Badge size="xs" variant="outline" color={cfg.format === 'landscape' ? 'blue' : 'pink'}>
                {cfg.format === 'landscape' ? '16:9' : '9:16'}
              </Badge>
              {cfg.intro.enabled && <Badge size="xs" color="violet" variant="dot">intro {cfg.intro.duration}s</Badge>}
              {cfg.outro.enabled && <Badge size="xs" color="grape" variant="dot">outro {cfg.outro.duration}s</Badge>}
              {cfg.music.enabled && cfg.music.fileName && <Badge size="xs" color="green" variant="dot">music</Badge>}
            </Group>

            {exporting && (
              <Box>
                <Progress value={progressPct} color="cyan" size="xs" animated mb={4} />
                <Text size="xs" c="dimmed" ff="monospace" lineClamp={1}>{progress}</Text>
              </Box>
            )}

            {lastOutput && !exporting && (
              <Group gap="xs">
                <IconCheck size={12} color="var(--mantine-color-cyan-4)" />
                <Text size="xs" c="cyan.4" ff="monospace" truncate style={{ flex: 1 }}>{lastOutput}</Text>
                <Button size="xs" variant="subtle" color="gray"
                  onClick={() => window.electronAPI?.showInFolder(lastOutput)}>
                  Open folder
                </Button>
              </Group>
            )}

            <Button color="cyan" fullWidth size="sm" leftSection={<IconDownload size={15} />}
              loading={exporting} disabled={clips.length === 0} onClick={handleExport}>
              {exporting ? 'Rendering...' : 'Export MP4'}
            </Button>
          </Stack>
        </Paper>
      </Stack>
    </ScrollArea>
  );
}

function FormatCard({ active, onClick, icon, label, sub, dims }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; sub: string; dims: string;
}) {
  return (
    <Box onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 6, textAlign: 'center',
      border: `1px solid ${active ? 'var(--mantine-color-cyan-7)' : 'var(--mantine-color-dark-4)'}`,
      background: active ? 'rgba(12,133,153,0.1)' : 'var(--mantine-color-dark-7)',
      cursor: 'pointer', transition: 'all 0.15s ease',
    }}>
      <Box style={{ color: active ? 'var(--mantine-color-cyan-4)' : 'var(--mantine-color-dark-2)' }} mb={4}>{icon}</Box>
      <Text size="xs" fw={600} c={active ? 'cyan.3' : 'dimmed'}>{label}</Text>
      <Text size="xs" c="dimmed">{sub}</Text>
      <Text size="xs" c="dark.3" ff="monospace">{dims}</Text>
    </Box>
  );
}

function SlideSection({ label, config, onChange, onPickImage, badge }: {
  label: string; config: SlideConfig; onChange: (p: Partial<SlideConfig>) => void;
  onPickImage: () => void; badge: string;
}) {
  return (
    <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
      <Group justify="space-between" mb={config.enabled ? 'sm' : 0}>
        <Group gap={6}>
          <IconPhoto size={13} color="var(--mantine-color-cyan-4)" />
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>{label}</Text>
          <Badge size="xs" variant="outline" color="dark">{badge}</Badge>
        </Group>
        <Switch size="xs" checked={config.enabled}
          onChange={e => onChange({ enabled: e.currentTarget.checked })} color="cyan" />
      </Group>
      {config.enabled && (
        <Stack gap="sm">
          <SegmentedControl size="xs" fullWidth value={config.type}
            onChange={v => onChange({ type: v as any })}
            data={[{ label: 'Color background', value: 'color' }, { label: 'Image', value: 'image' }]}
            styles={{ label: { fontFamily: 'monospace', fontSize: '11px' } }} />
          {config.type === 'color' ? (
            <ColorInput size="xs" label="Background color" value={config.color}
              onChange={v => onChange({ color: v })} format="hex"
              styles={{ input: { fontFamily: 'monospace', fontSize: '11px' } }} />
          ) : (
            <Box>
              {config.fileDataUrl ? (
                <Box style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', height: 80 }}>
                  <img src={config.fileDataUrl} alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#111' }} />
                  <ActionIcon size="xs" style={{ position: 'absolute', top: 4, right: 4 }}
                    color="red" variant="filled"
                    onClick={() => onChange({ filePath: undefined, fileDataUrl: undefined, type: 'color' })}>
                    <IconX size={10} />
                  </ActionIcon>
                </Box>
              ) : (
                <Button size="xs" variant="outline" color="gray"
                  leftSection={<IconUpload size={11} />} fullWidth onClick={onPickImage}>
                  Choose PNG / JPG
                </Button>
              )}
            </Box>
          )}
          <TextInput size="xs" label="Text overlay (optional)" placeholder="Project name..."
            value={config.text} onChange={e => onChange({ text: e.target.value })}
            styles={{ input: { fontFamily: 'monospace', fontSize: '11px' } }} />
          <NumberInput size="xs" label="Duration (seconds)" value={config.duration}
            min={1} max={30} onChange={v => onChange({ duration: Number(v) })}
            styles={{ input: { fontFamily: 'monospace', fontSize: '11px' } }} />
        </Stack>
      )}
    </Paper>
  );
}
