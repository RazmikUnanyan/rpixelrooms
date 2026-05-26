'use client';
import { Stack, Paper, Text, Group, Button, NumberInput, TextInput, ActionIcon, Badge, Box, Tooltip } from '@mantine/core';
import { IconPlus, IconTrash, IconClock, IconInfoCircle } from '@tabler/icons-react';
import { ScheduleEntry } from '../types';
import { nanoid, formatTime } from '../utils';

interface Props {
  schedule: ScheduleEntry[];
  onChange: (s: ScheduleEntry[]) => void;
  totalDuration: number;
  disabled?: boolean;
}

export default function ScheduleEditor({ schedule, onChange, totalDuration, disabled }: Props) {
  const add = () => {
    const lastEnd = schedule.length > 0
        ? schedule[schedule.length - 1].startOffset + schedule[schedule.length - 1].duration
        : 0;
    onChange([...schedule, {
      id: nanoid(),
      startOffset: lastEnd + 5,
      duration: 30,
      label: `Clip ${schedule.length + 1}`,
    }]);
  };

  const remove = (id: string) => onChange(schedule.filter(e => e.id !== id));

  const upd = (id: string, field: keyof ScheduleEntry, val: string | number) =>
      onChange(schedule.map(e => e.id === id ? { ...e, [field]: val } : e));

  const maxT = totalDuration > 0
      ? totalDuration
      : Math.max(60, ...schedule.map(e => e.startOffset + e.duration + 10));

  return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap={6}>
            <IconClock size={13} color="var(--mantine-color-cyan-5)" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
              Schedule
            </Text>
            <Tooltip
                label="The camera will start and stop automatically based on the schedule. Without a schedule — manual mode."
                multiline w={240}
                position="right"
            >
              <IconInfoCircle size={11} color="var(--mantine-color-dark-3)" style={{ cursor: 'help' }} />
            </Tooltip>
          </Group>
          {!disabled && (
              <Button
                  size="xs"
                  variant="subtle"
                  color="cyan"
                  leftSection={<IconPlus size={11} />}
                  onClick={add}
              >
                Add
              </Button>
          )}
        </Group>

        {schedule.length === 0 ? (
            <Box p="sm" style={{
              border: '1px dashed var(--mantine-color-dark-4)',
              borderRadius: 6,
              textAlign: 'center',
            }}>
              <Text size="xs" c="dimmed">Manual mode — no schedule</Text>
            </Box>
        ) : (
            <>
              <Stack gap={6}>
                {schedule.map((e, i) => {
                  const end = e.startOffset + e.duration;
                  const over = totalDuration > 0 && end > totalDuration;
                  return (
                      <Paper key={e.id} p="xs" withBorder style={{
                        borderLeft: '2px solid var(--mantine-color-cyan-8)',
                        borderColor: over ? 'var(--mantine-color-red-8)' : undefined,
                        background: 'var(--mantine-color-dark-7)',
                        animation: 'fadeIn 0.15s ease',
                      }}>
                        <Stack gap={5}>
                          <Group justify="space-between">
                            <Group gap={6}>
                              <Badge size="xs" color="cyan" variant="dot">#{i + 1}</Badge>
                              <Text size="xs" c="dimmed" ff="monospace">
                                {formatTime(e.startOffset)} → {formatTime(end)}
                              </Text>
                              {over && <Text size="xs" c="red.5">exceeds limit</Text>}
                            </Group>
                            {!disabled && (
                                <ActionIcon size="xs" variant="subtle" color="red" onClick={() => remove(e.id)}>
                                  <IconTrash size={11} />
                                </ActionIcon>
                            )}
                          </Group>
                          <TextInput
                              size="xs"
                              placeholder="Clip name"
                              value={e.label}
                              disabled={disabled}
                              onChange={ev => upd(e.id, 'label', ev.target.value)}
                              styles={{ input: { fontFamily: 'IBM Plex Mono', fontSize: '11px' } }}
                          />
                          <Group grow gap={6}>
                            <NumberInput
                                size="xs"
                                label="Start (sec)"
                                value={e.startOffset}
                                min={0}
                                disabled={disabled}
                                onChange={v => upd(e.id, 'startOffset', Number(v))}
                                styles={{ label: { fontSize: '10px' }, input: { fontFamily: 'IBM Plex Mono', fontSize: '11px' } }}
                            />
                            <NumberInput
                                size="xs"
                                label="Duration (sec)"
                                value={e.duration}
                                min={1}
                                disabled={disabled}
                                onChange={v => upd(e.id, 'duration', Number(v))}
                                styles={{ label: { fontSize: '10px' }, input: { fontFamily: 'IBM Plex Mono', fontSize: '11px' } }}
                            />
                          </Group>
                        </Stack>
                      </Paper>
                  );
                })}
              </Stack>

              {/* Timeline */}
              <Box>
                <Text size="xs" c="dimmed" ff="monospace" mb={4}>Timeline</Text>
                <Box style={{
                  position: 'relative', height: 14,
                  background: 'var(--mantine-color-dark-6)',
                  borderRadius: 3, overflow: 'hidden',
                }}>
                  {schedule.map(e => (
                      <Box key={e.id} style={{
                        position: 'absolute',
                        left: `${(e.startOffset / maxT) * 100}%`,
                        width: `${Math.max((e.duration / maxT) * 100, 0.5)}%`,
                        height: '100%',
                        background: 'var(--mantine-color-cyan-8)',
                        borderRight: '1px solid var(--mantine-color-cyan-5)',
                        opacity: 0.8,
                      }} />
                  ))}
                </Box>
                <Group justify="space-between" mt={2}>
                  <Text size="xs" c="dark.3" ff="monospace">0:00</Text>
                  <Text size="xs" c="dark.3" ff="monospace">{formatTime(maxT)}</Text>
                </Group>
              </Box>
            </>
        )}
      </Stack>
  );
}