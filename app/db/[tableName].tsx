import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';

import * as schema from '../../db/schema';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { useQuery } from "@tanstack/react-query"
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { db } from '@/db';
import DataView from '@/components/DataView';

export default function TableScreen() {
  const { tableName } = useGlobalSearchParams();
  const table = Object.values(schema).find(t => getTableConfig(t).name == tableName)
  const { data, error, isPending } = useQuery({
    queryKey: ['tableData'],
    queryFn: async () => table && await db.select().from(table),
  })

    if (error) {
      return (
        <View>
          <Text>{error.name}</Text>
          <Text>DB error: {error.message}</Text>
          <Text>{`${error.cause}`}</Text>
          <Text>{error.stack}</Text>
        </View>
      );
    }
  
    if (isPending) {
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
            {data && data.map((item) => <DataView data={item}/>)}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Stack.Screen>
  );
}
