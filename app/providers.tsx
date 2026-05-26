'use client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider defaultColorScheme="dark">
      <Notifications position="top-right" zIndex={9999} />
      {children}
    </MantineProvider>
  );
}
