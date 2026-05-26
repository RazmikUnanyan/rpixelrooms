'use client';
import { Select, Group, Button, Text, Box, Badge, Loader } from '@mantine/core';
import { IconUsb, IconRefresh, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { VideoDevice } from '../types';

interface Props {
    devices: VideoDevice[];
    selected: string | null;
    loading: boolean;
    onSelect: (id: string) => void;
    onRefresh: () => void;
    disabled?: boolean;
}

export default function CameraSelector({ devices, selected, loading, onSelect, onRefresh, disabled }: Props) {
    const selectedDevice = devices.find(d => d.deviceId === selected);

    const isUSB = (label: string) => {
        const l = label.toLowerCase();
        return !l.includes('integrated') && !l.includes('built-in') && !l.includes('facetime');
    };

    return (
        <Box>
            <Group gap={6} mb={8}>
                <IconUsb size={13} color="var(--mantine-color-cyan-4)" />
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.09em' }}>
                    Input Device
                </Text>
                {loading && <Loader size={10} color="cyan" />}
            </Group>

            <Group gap={6} align="flex-end">
                <Select
                    style={{ flex: 1 }}
                    size="sm"
                    placeholder={loading ? 'Searching…' : devices.length === 0 ? 'No cameras found' : 'Select camera…'}
                    data={devices.map(d => ({ value: d.deviceId, label: d.label }))}
                    value={selected}
                    onChange={v => v && onSelect(v)}
                    disabled={disabled || loading || devices.length === 0}
                    leftSection={selected ? <IconCheck size={12} color="var(--mantine-color-cyan-5)" /> : null}
                    styles={{
                        input: {
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontSize: '12px',
                            background: 'var(--mantine-color-dark-7)',
                            borderColor: selected
                                ? 'var(--mantine-color-cyan-8)'
                                : 'var(--mantine-color-dark-4)',
                        },
                        option: { fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' },
                    }}
                />
                <Button
                    size="sm"
                    variant="subtle"
                    color="gray"
                    px={8}
                    onClick={onRefresh}
                    disabled={disabled}
                    title="Refresh device list"
                    className="titlebar-no-drag"
                >
                    <IconRefresh size={14} />
                </Button>
            </Group>

            <Box mt={6} h={18}>
                {selectedDevice ? (
                    <Group gap={6}>
                        <Badge
                            size="xs"
                            variant="dot"
                            color={isUSB(selectedDevice.label) ? 'cyan' : 'gray'}
                        >
                            {isUSB(selectedDevice.label) ? 'USB' : 'Built-in'}
                        </Badge>
                        <Text size="xs" c="dimmed" ff="monospace">
                            {selectedDevice.deviceId.slice(0, 20)}…
                        </Text>
                    </Group>
                ) : !loading && devices.length === 0 ? (
                    <Group gap={4}>
                        <IconAlertCircle size={11} color="var(--mantine-color-yellow-5)" />
                        <Text size="xs" c="yellow.5">Connect a USB camera and press ↻</Text>
                    </Group>
                ) : !loading && devices.length > 0 ? (
                    <Text size="xs" c="dimmed">Found: {devices.length} devices</Text>
                ) : null}
            </Box>
        </Box>
    );
}