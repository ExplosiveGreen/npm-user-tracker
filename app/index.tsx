import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useState } from 'react';
import { ScrollView, Switch } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function Index() {
  const [username, setUsername] = useState("");
  const [users, setUsers] = useState<{
    username: string,
    enable: boolean
  }[]>([])

  return (
    <>
      <Input onChangeText={setUsername} value={username} placeholder='username' />
      <Button onPress={() => setUsers([...users, { username, enable: true }])} />
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            {users && users.map(({ username, enable }) => <Card className='w-full'>
              <CardContent className='flex-row justify-between'>
                <Text key={username}>{`username : ${username}`}</Text>
                <Switch onValueChange={(e) => setUsers([...users.filter(u => u.username != username), { username, enable: e }])}
                  value={enable} />
              </CardContent>
            </Card>)}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
