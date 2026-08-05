import '@/global.css';
import "react-native-random-uuid";
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <>
      <Stack />
      <PortalHost />
    </>
  );
}