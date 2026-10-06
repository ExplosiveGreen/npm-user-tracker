import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ThemeToggleButton } from '@/components/theme-toggle-button';

import { dbTables, cascadeDeleteRow } from '@/db';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { useLiveQuery } from '@tanstack/react-db';

// Nulls/undefined sort as empty; numeric strings compare numerically so
// counts and totals order sensibly, everything else falls back to text.
function compareValues(a: unknown, b: unknown): number {
  const sa = a === null || a === undefined ? '' : String(a);
  const sb = b === null || b === undefined ? '' : String(b);
  if (sa === '') return sb === '' ? 0 : 1;
  if (sb === '') return -1;
  const na = Number(sa);
  const nb = Number(sb);
  if (sa !== '' && sb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return sa.localeCompare(sb);
}

export default function TableScreen() {
  const { tableName } = useGlobalSearchParams();
  const table = dbTables.find((t) => t.name === tableName);
  const [filter, setFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);

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

  const needle = filter.trim().toLowerCase();
  const filtered = (data ?? []).filter((item) => {
    if (!needle) return true;
    return Object.entries(item)
      .filter(([k]) => !k.startsWith('$'))
      .some(([, v]) => String(v ?? '').toLowerCase().includes(needle));
  });
  const rows = sortColumn
    ? filtered.slice().sort((a, b) => {
        const cmp = compareValues(
          (a as Record<string, unknown>)[sortColumn],
          (b as Record<string, unknown>)[sortColumn],
        );
        return sortDesc ? -cmp : cmp;
      })
    : filtered;

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDesc((d) => !d);
    } else {
      setSortColumn(column);
      setSortDesc(false);
    }
  };

  return (
    <Stack.Screen
      options={{ title: `db/${tableName}`, headerRight: () => <ThemeToggleButton /> }}
    >
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <View className="gap-2 p-4 pb-0">
            <Input
              testID="filter-input"
              value={filter}
              onChangeText={setFilter}
              placeholder="Filter rows…"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
              <View className="flex-row gap-2">
                {table.columns.map((column) => {
                  const selected = sortColumn === column;
                  return (
                    <Button
                      key={column}
                      testID={`sort-chip-${column}`}
                      variant={selected ? 'default' : 'outline'}
                      size="sm"
                      onPress={() => toggleSort(column)}
                    >
                      <Text>{selected ? `${column} ${sortDesc ? '↓' : '↑'}` : column}</Text>
                    </Button>
                  );
                })}
              </View>
            </ScrollView>
            <Text className="text-muted-foreground text-xs">
              {rows.length} of {data?.length ?? 0} rows
              {sortColumn ? ` · sorted by ${sortColumn} ${sortDesc ? 'desc' : 'asc'}` : ''}
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            {rows?.map((item, i) => (
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
