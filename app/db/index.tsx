import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { dbTables } from '@/db';
import { ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Link, Stack } from 'expo-router';

export default function DbScreen() {
  return (
    <Stack.Screen options={{ title: "db" }}>
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <StatusBar style="auto" />
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            {dbTables.map(({ name, columns }) => (
              <Link key={name} href={`/db/${name}`}>
                <Card className="w-full">
                  <CardHeader>
                    <CardTitle>{name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {columns.map((col) => (
                      <Text key={col}>{col}</Text>
                    ))}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Stack.Screen>
  );
}