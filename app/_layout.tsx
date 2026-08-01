import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { Text } from '@/components/ui/text';
import { runMigrations } from '@/db/migrate';
import { Stack } from 'expo-router';
import { View } from 'react-native';

export default function RootLayout() {
  const { success, error } = runMigrations();

  if (error) {
    return (
      <View>
        <Text>{error.name}</Text>
        <Text>Migration error: {error.message}</Text>
        <Text>{`${error.cause}`}</Text>
        <Text>{error.stack}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View>
        <Text>Migration is in progress...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack />
      <PortalHost />
    </>
  );
}
