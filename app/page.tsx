'use client';
import { useState } from 'react';
import {
  Box, Text, Group, Button, Stack, Paper,
  Grid, Badge, NumberInput, Select, TextInput,
  Modal, Divider, Progress, ActionIcon, Tooltip, Tabs,
} from '@mantine/core';
import {
  IconPlayerRecord, IconPlayerStop, IconCamera,
  IconSettings, IconDownload, IconCheck,
  IconAdjustments, IconList, IconMovie,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';

import CameraPreview from './components/CameraPreview';
import CameraSelector from './components/CameraSelector';
import ScheduleEditor from './components/ScheduleEditor';
import ClipsPanel from './components/ClipsPanel';
import ExportPanel from './components/ExportPanel';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import { SessionConfig, RecordedClip } from './types';
import { formatTime } from './utils';

const DEFAULT_CONFIG: SessionConfig = {
  sessionName: `Session ${new Date().toLocaleDateString('en')}`,
  totalDuration: 0,
  schedule: [],
  resolution: '720p',
  framerate: 30,
  selectedDeviceId: null,
};

export default function HomePage() {
  const [config, setConfig] = useState<SessionConfig>(DEFAULT_CONFIG);
  const [settingsOpen, { open: openSettings, close: closeSettings }] = useDisclosure(false);
  const [previewClip, setPreviewClip] = useState<RecordedClip | null>(null);
  const [rightTab, setRightTab] = useState<string>('camera');

  const upd = (patch: Partial<SessionConfig>) =>
    setConfig(prev => ({ ...prev, ...patch }));

  const rec = useSessionRecorder(config);

  const totalDur = rec.clips.reduce((a, c) => a + c.duration, 0);
  const sessionPct = config.totalDuration > 0
    ? Math.min((rec.sessionElapsed / config.totalDuration) * 100, 100)
    : 0;

  const handleEndSession = () => {
    rec.endSession();
    if (rec.clips.length > 0) setRightTab('export');
  };

  return (
    <>
      <Box mih="100vh" display="flex" style={{ flexDirection: 'column' }}>

        <Box className="titlebar-drag" h={38} style={{
          borderBottom: '1px solid var(--mantine-color-dark-6)',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          paddingLeft: 14, paddingRight: 148,
        }}>
          <Group gap={8} className="titlebar-no-drag">
            <Text size="xs" fw={700} c="#FF0090" ff="monospace" style={{ letterSpacing: '0.12em' }}>
              PIXEL ROOMS
            </Text>
            <Text size="xs" c="gray.5" ff="monospace">|</Text>
            <Text size="xs" c="gray.5" ff="monospace" truncate maw={200}>
              {config.sessionName}
            </Text>
          </Group>
          <Group gap={10} className="titlebar-no-drag" ml="auto">
            {rec.sessionStarted && (
              <Badge size="xs" variant="dot"
                color={rec.state === 'recording' ? 'red' : 'yellow'} ff="monospace">
                {rec.state === 'recording' ? `REC ${formatTime(rec.clipElapsed)}` : 'WAITING'}
              </Badge>
            )}
            <Text size="xs" ff="monospace" c="cyan.4" fw={600}>{formatTime(rec.sessionElapsed)}</Text>
            <Tooltip label="Session settings" position="bottom">
              <ActionIcon size="sm" variant="subtle" color="gray"
                onClick={openSettings} disabled={rec.sessionStarted}>
                <IconSettings size={13} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>

        <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
          <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Stack gap="md">
                <CameraPreview
                  stream={rec.stream} state={rec.state}
                  clipElapsed={rec.clipElapsed} clipDuration={rec.activeClipDuration}
                  clipLabel={rec.activeClipLabel} sessionElapsed={rec.sessionElapsed}
                />

                {config.totalDuration > 0 && rec.sessionStarted && (
                  <Box>
                    <Group justify="space-between" mb={4}>
                      <Text size="xs" c="dimmed" ff="monospace">Session progress</Text>
                      <Text size="xs" c="cyan.4" ff="monospace">
                        {formatTime(rec.sessionElapsed)} / {formatTime(config.totalDuration)}
                      </Text>
                    </Group>
                    <Progress value={sessionPct} color="cyan" size={3} radius="xl" />
                  </Box>
                )}

                <Paper withBorder p="sm" style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
                  <Group justify="space-between">
                    <Group gap={8}>
                      {!rec.sessionStarted ? (
                        <Button size="sm" color="cyan" leftSection={<IconCamera size={15} />}
                          onClick={rec.startSession} disabled={!config.selectedDeviceId}>
                          Start session
                        </Button>
                      ) : (
                        <>
                          {config.schedule.length === 0 && (
                            <Button size="sm"
                              color={rec.state === 'recording' ? 'orange' : 'red'}
                              variant={rec.state === 'recording' ? 'outline' : 'filled'}
                              leftSection={rec.state === 'recording'
                                ? <IconPlayerStop size={15} />
                                : <IconPlayerRecord size={15} />}
                              onClick={rec.toggleRecord}>
                              {rec.state === 'recording' ? 'Stop' : 'Record'}
                            </Button>
                          )}
                          <Button size="sm" color="red" variant="subtle"
                            leftSection={<IconPlayerStop size={15} />}
                            onClick={handleEndSession}>
                            End session
                          </Button>
                        </>
                      )}
                    </Group>
                    <Group gap={6}>
                      <Badge variant="outline" color="dark" size="sm" ff="monospace">
                        {config.resolution} · {config.framerate}fps
                      </Badge>
                      {rec.clips.length > 0 && (
                        <Badge variant="outline" color="cyan" size="sm">{rec.clips.length} clips</Badge>
                      )}
                    </Group>
                  </Group>
                </Paper>

                {rec.clips.length > 0 && !rec.sessionStarted && (
                  <Paper withBorder p="md" style={{
                    borderColor: 'var(--mantine-color-cyan-9)',
                    background: 'rgba(12,133,153,0.06)',
                  }}>
                    <Group justify="space-between">
                      <Box>
                        <Group gap={6} mb={3}>
                          <IconCheck size={13} color="var(--mantine-color-cyan-4)" />
                          <Text size="sm" fw={600} c="cyan.3">Session complete</Text>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {rec.clips.length} clips · {formatTime(Math.round(totalDur))} recorded
                        </Text>
                      </Box>
                      <Button color="cyan" leftSection={<IconDownload size={15} />}
                        onClick={() => setRightTab('export')}>
                        Go to export
                      </Button>
                    </Group>
                  </Paper>
                )}
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="md">
                <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-dark-5)' }}>
                  <CameraSelector
                    devices={rec.devices} selected={config.selectedDeviceId}
                    loading={rec.loadingDevices}
                    onSelect={id => upd({ selectedDeviceId: id })}
                    onRefresh={rec.refreshDevices} disabled={rec.sessionStarted}
                  />
                </Paper>

                <Paper withBorder style={{ borderColor: 'var(--mantine-color-dark-5)', overflow: 'hidden' }}>
                  <Tabs value={rightTab} onChange={v => v && setRightTab(v)}
                    styles={{ tab: { fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.04em' } }}>
                    <Tabs.List style={{ borderBottom: '1px solid var(--mantine-color-dark-6)' }}>
                      <Tabs.Tab value="camera" leftSection={<IconAdjustments size={12} />}>Schedule</Tabs.Tab>
                      <Tabs.Tab value="clips" leftSection={<IconList size={12} />}
                        rightSection={rec.clips.length > 0
                          ? <Badge size="xs" color="cyan" circle variant="filled">{rec.clips.length}</Badge>
                          : null}>
                        Clips
                      </Tabs.Tab>
                      <Tabs.Tab value="export" leftSection={<IconMovie size={12} />}
                        rightSection={rec.clips.length > 0 && !rec.sessionStarted
                          ? <Badge size="xs" color="green" variant="dot" />
                          : null}>
                        Export
                      </Tabs.Tab>
                    </Tabs.List>

                    <Box p="md">
                      <Tabs.Panel value="camera">
                        <ScheduleEditor schedule={config.schedule}
                          onChange={s => upd({ schedule: s })}
                          totalDuration={config.totalDuration} disabled={rec.sessionStarted} />
                      </Tabs.Panel>
                      <Tabs.Panel value="clips">
                        <ClipsPanel clips={rec.clips} onRemove={rec.removeClip} onPreview={setPreviewClip} />
                        {rec.clips.length > 0 && (
                          <Box mt="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-6)' }}>
                            <Group grow>
                              <Box ta="center">
                                <Text size="xl" fw={700} ff="monospace" c="cyan.3">{rec.clips.length}</Text>
                                <Text size="xs" c="dimmed">clips</Text>
                              </Box>
                              <Box ta="center">
                                <Text size="xl" fw={700} ff="monospace" c="cyan.3">{formatTime(Math.round(totalDur))}</Text>
                                <Text size="xs" c="dimmed">recorded</Text>
                              </Box>
                            </Group>
                          </Box>
                        )}
                      </Tabs.Panel>
                      <Tabs.Panel value="export">
                        <ExportPanel clips={rec.clips} sessionName={config.sessionName} />
                      </Tabs.Panel>
                    </Box>
                  </Tabs>
                </Paper>
              </Stack>
            </Grid.Col>
          </Grid>
        </Box>
      </Box>

      <Modal opened={settingsOpen} onClose={closeSettings}
        title={<Group gap={6}><IconSettings size={15} /><Text fw={600} size="sm">Session settings</Text></Group>}
        size="sm"
        styles={{
          content: { background: 'var(--mantine-color-dark-8)' },
          header: { background: 'var(--mantine-color-dark-8)', borderBottom: '1px solid var(--mantine-color-dark-6)' },
        }}>
        <Stack gap="md" pt="xs">
          <TextInput label="Session name" value={config.sessionName}
            onChange={e => upd({ sessionName: e.target.value })}
            size="sm" styles={{ input: { fontFamily: 'monospace' } }} />
          <NumberInput label="Time limit (sec, 0 = unlimited)" value={config.totalDuration}
            min={0} size="sm" onChange={v => upd({ totalDuration: Number(v) })} />
          <Select label="Resolution" value={config.resolution} size="sm"
            data={[
              { value: '480p', label: '480p — 854×480' },
              { value: '720p', label: '720p HD — 1280×720' },
              { value: '1080p', label: '1080p Full HD — 1920×1080' },
            ]}
            onChange={v => upd({ resolution: v as any })} />
          <Select label="Frame rate" value={String(config.framerate)} size="sm"
            data={[
              { value: '24', label: '24 fps — cinematic' },
              { value: '30', label: '30 fps — standard' },
              { value: '60', label: '60 fps — smooth' },
            ]}
            onChange={v => upd({ framerate: Number(v) as any })} />
          <Divider color="dark.6" />
          <Button color="cyan" onClick={closeSettings} fullWidth>Save</Button>
        </Stack>
      </Modal>

      <Modal opened={!!previewClip} onClose={() => setPreviewClip(null)}
        title={<Text size="sm" fw={600} ff="monospace">{previewClip?.label}</Text>}
        size="xl"
        styles={{ content: { background: '#000' }, header: { background: 'var(--mantine-color-dark-8)' } }}>
        {previewClip && (
          <video src={previewClip.url} controls autoPlay
            style={{ width: '100%', display: 'block', borderRadius: 4 }} />
        )}
      </Modal>
    </>
  );
}
