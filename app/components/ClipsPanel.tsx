'use client';
import { Stack, Paper, Text, Group, Badge, ActionIcon, Box, ScrollArea, Button } from '@mantine/core';
import { IconPlayerPlay, IconTrash, IconVideo, IconFolder } from '@tabler/icons-react';
import { RecordedClip } from '../types';
import { formatTime, formatSize } from '../utils';

interface Props {
  clips: RecordedClip[];
  onRemove: (id: string) => void;
  onPreview: (clip: RecordedClip) => void;
}

export default function ClipsPanel({ clips, onRemove, onPreview }: Props) {
  if (clips.length === 0) {
    return (
      <Box style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '28px 0', gap: 8,
      }}>
        <IconVideo size={30} color="var(--mantine-color-dark-4)" />
        <Text size="xs" c="dimmed" ta="center">Записанные клипы появятся здесь</Text>
      </Box>
    );
  }

  return (
    <ScrollArea h={260} scrollbarSize={3}>
      <Stack gap={5}>
        {clips.map((clip, i) => (
          <Paper
            key={clip.id}
            p="xs"
            withBorder
            className="clip-enter"
            style={{
              borderColor: 'var(--mantine-color-dark-4)',
              borderLeft: '2px solid var(--mantine-color-cyan-8)',
              background: 'var(--mantine-color-dark-7)',
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap={6} mb={3}>
                  <Badge size="xs" color="cyan" variant="outline">#{i + 1}</Badge>
                  <Text size="xs" fw={600} truncate style={{ flex: 1 }}>{clip.label}</Text>
                </Group>
                <Group gap="sm">
                  <Text size="xs" c="dimmed" ff="monospace">{formatTime(Math.round(clip.duration))}</Text>
                  <Text size="xs" c="dimmed" ff="monospace">{formatSize(clip.blob.size)}</Text>
                </Group>
                {clip.savedPath && (
                  <Button
                    size="xs" variant="subtle" color="gray" px={0} mt={1}
                    leftSection={<IconFolder size={10} />}
                    onClick={() => window.electronAPI?.showInFolder(clip.savedPath!)}
                    styles={{ root: { height: 18, minHeight: 0, fontSize: '10px' } }}
                  >
                    Открыть папку
                  </Button>
                )}
              </Box>
              <Group gap={3} style={{ flexShrink: 0 }}>
                <ActionIcon size="sm" variant="subtle" color="cyan" onClick={() => onPreview(clip)}>
                  <IconPlayerPlay size={12} />
                </ActionIcon>
                <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onRemove(clip.id)}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
    </ScrollArea>
  );
}
