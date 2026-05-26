'use client';
import { useEffect, useRef } from 'react';
import { Box, Text } from '@mantine/core';
import { RecordingState } from '../types';
import { formatTime } from '../utils';

interface Props {
  stream: MediaStream | null;
  state: RecordingState;
  clipElapsed: number;
  clipDuration: number;
  clipLabel: string;
  sessionElapsed: number;
}

export default function CameraPreview({
  stream, state, clipElapsed, clipDuration, clipLabel, sessionElapsed
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const isRec = state === 'recording';
  const pct = clipDuration > 0 ? Math.min(clipElapsed / clipDuration, 1) * 100 : 0;

  return (
    <Box style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '16/9',
      background: '#000',
      borderRadius: 6,
      overflow: 'hidden',
      border: isRec
        ? '1px solid rgba(250, 82, 82, 0.4)'
        : '1px solid var(--mantine-color-dark-5)',
      transition: 'border-color 0.3s ease',
    }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }}
      />

      {/* No signal state */}
      {!stream && (
        <Box style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
        }}>
          <Box style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '1.5px solid var(--mantine-color-dark-4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text size="xl" c="dark.4">⏻</Text>
          </Box>
          <Text size="xs" c="dark.3" ff="monospace" style={{ letterSpacing: '0.15em' }}>
            НЕТ СИГНАЛА
          </Text>
        </Box>
      )}

      {/* Session clock — top right */}
      {stream && (
        <Box style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 4, padding: '3px 9px',
          backdropFilter: 'blur(4px)',
        }}>
          <Text ff="monospace" size="xs" c="white" fw={600} style={{ letterSpacing: '0.05em' }}>
            {formatTime(sessionElapsed)}
          </Text>
        </Box>
      )}

      {/* REC indicator — top left */}
      {isRec && (
        <Box style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 4, padding: '3px 9px',
          backdropFilter: 'blur(4px)',
        }}>
          <Box style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#fa5252',
            animation: 'recPulse 1s ease-in-out infinite',
          }} />
          <Text ff="monospace" size="xs" c="white" fw={700}>
            {clipDuration > 0 ? `REC ${formatTime(clipElapsed)} / ${formatTime(clipDuration)}` : `REC ${formatTime(clipElapsed)}`}
          </Text>
        </Box>
      )}

      {/* Clip label — bottom left when recording */}
      {isRec && clipLabel && (
        <Box style={{
          position: 'absolute', bottom: clipDuration > 0 ? 6 : 10, left: 10,
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 4, padding: '2px 8px',
        }}>
          <Text ff="monospace" size="xs" c="gray.4">{clipLabel}</Text>
        </Box>
      )}

      {/* Waiting badge */}
      {state === 'waiting' && stream && (
        <Box style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 4, padding: '3px 9px',
        }}>
          <Text ff="monospace" size="xs" c="yellow.4" fw={600} style={{ letterSpacing: '0.1em' }}>
            ОЖИДАНИЕ
          </Text>
        </Box>
      )}

      {/* Clip progress bar */}
      {isRec && clipDuration > 0 && (
        <Box style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3 }}>
          <Box style={{ height: '100%', background: 'rgba(255,255,255,0.12)' }}>
            <Box style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--mantine-color-red-5)',
              transition: 'width 0.7s linear',
            }} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
