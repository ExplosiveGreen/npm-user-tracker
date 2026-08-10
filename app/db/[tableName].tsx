import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ThemeToggleButton } from '@/components/theme-toggle-button';

import { dbTables, cascadeDeleteRow } from '@/db';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { useLiveQuery } from '@tanstack/react-db';

export default function TableScreen() {
  const { tableName } = useGlobalSearchParams();
  const table = dbTables.find((t) => t.name === tableName);

  const { data, isError, isReady } = useLiveQuery(
    (q) => (table ? q.from({ row: table.collection }) : undefined),
  );

  const promptDeleteRow = (item: Record<string, unknown>) => {
    // Every row exposes its primary key (the same value the collection derives
    // via its `getKey` config) as the virtual `$key` prop.
    const key = String(item.$key);
    Alert.alert(
      'Delete row',
      `Delete this row from ${tableName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void cascadeDeleteRow(table!.name, key),
        },
      ],
    );
  };

  if (!table) {
    return (
      <View>
        <Text>Unknown table</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View>
        <Text>Failed to load {tableName}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View>
        <Text>fetching is in progress...</Text>
      </View>
    );
  }

  return (
    <Stack.Screen
      options={{ title: `db/${tableName}`, headerRight: () => <ThemeToggleButton /> }}
    >
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            {data?.map((item, i) => (
              <Card key={String(item.$key)} className="w-full">
                <CardHeader>
                  <CardTitle>#{String(i + 1)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(item)
                    .filter(([k]) => !k.startsWith('$'))
                    .map(([k, v]) => (
                      <Text key={k}>{`${k} : ${String(v)}`}</Text>))}
                </CardContent>
                <CardFooter>
                  <Button testID="delete-row" variant="destructive" onPress={() => promptDeleteRow(item)}>
                    <Text>Delete</Text>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Stack.Screen>
  );
}