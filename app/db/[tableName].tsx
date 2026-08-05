import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';

import { dbTables } from '@/db';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { useLiveQuery } from '@tanstack/react-db';

export default function TableScreen() {
  const { tableName } = useGlobalSearchParams();
  const table = dbTables.find((t) => t.name === tableName);

  const { data, isError, isReady } = useLiveQuery(
    (q) => (table ? q.from({ row: table.collection }) : undefined),
  );

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
    <Stack.Screen options={{ title: `db/${tableName}` }}>
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <StatusBar style="auto" />
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            {data?.map((item, i) => (
              <Card key={i} className="w-full">
                <CardHeader>
                  <CardTitle>#{String(i + 1)}</CardTitle>
                </CardHeader>
                <CardContent>
                  {Object.entries(item).map(([k, v]) => (
                    <Text key={k}>{`${k} : ${String(v)}`}</Text>))}
                </CardContent>
              </Card>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Stack.Screen>
  );
}