import './global.css';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { PortalHost } from '@rn-primitives/portal';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

const SAMPLE_PACKAGES = [
  {
    name: 'react',
    version: '19.2.3',
    downloads: '28.4M',
    description: 'A JavaScript library for building user interfaces.',
  },
  {
    name: 'expo',
    version: '57.0.8',
    downloads: '1.2M',
    description: 'An open-source platform for making universal native apps.',
  },
  {
    name: 'nativewind',
    version: '4.2.6',
    downloads: '420K',
    description: 'Use Tailwind CSS to style your React Native components.',
  },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView className="bg-background flex-1">
        <StatusBar style="auto" />
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4 pb-8"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1.5 px-1 pt-2">
            <Text variant="h3">npm user tracker</Text>
            <Text variant="muted">
              Track packages and download trends. Cards below use React Native Reusables.
            </Text>
          </View>

          {SAMPLE_PACKAGES.map((pkg) => (
            <Card key={pkg.name} className="w-full">
              <CardHeader>
                <CardTitle>{pkg.name}</CardTitle>
                <CardDescription>v{pkg.version}</CardDescription>
              </CardHeader>
              <CardContent>
                <Text>{pkg.description}</Text>
              </CardContent>
              <CardFooter className="justify-between">
                <Text variant="muted">Weekly downloads</Text>
                <Text className="font-semibold">{pkg.downloads}</Text>
              </CardFooter>
            </Card>
          ))}

          <Card className="w-full">
            <CardHeader>
              <CardTitle>Getting started</CardTitle>
              <CardDescription>React Native Reusables is ready</CardDescription>
            </CardHeader>
            <CardContent className="gap-2">
              <Text>
                NativeWind, theme tokens, and the Card component are configured. Add more
                components with the CLI or by copying from the docs.
              </Text>
              <Text variant="code">npx @react-native-reusables/cli add button</Text>
            </CardContent>
          </Card>
        </ScrollView>
        <PortalHost />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
