import { safeRandomUUID } from '@tanstack/db';
import { useLiveQuery } from '@tanstack/react-db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { npmUsersCollection } from '@/db';
import { useState } from 'react';
import { ScrollView, Switch } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function Index() {
  const [username, setUsername] = useState("");
  const { data: users } = useLiveQuery((q) =>
    q.from({ users: npmUsersCollection }).select(({ users }) => ({
      id: users.id,
      username: users.username,
      enable: users.enable,
    })),
  );

  const addUser = () => {
    if (!username.trim()) return;
    npmUsersCollection.insert({
      id: safeRandomUUID(),
      username: username.trim(),
      email: null,
      enable: true,
    });
    setUsername("");
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView className="bg-background flex-1">
        <Input onChangeText={setUsername} value={username} placeholder='username' />
        <Button onPress={addUser} className="my-2">
          <Text>Add user</Text>
        </Button>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4 pb-8"
          showsVerticalScrollIndicator={false}
        >
          {users?.map(({ id, username, enable }) => (
            <Card key={id} className='w-full'>
              <CardContent className='flex-row justify-between'>
                <Text>{`username : ${username}`}</Text>
                <Switch
                  onValueChange={(e) =>
                    void npmUsersCollection.update(id, (draft) => {
                      draft.enable = e;
                    })
                  }
                  value={enable}
                />
              </CardContent>
            </Card>
          ))}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}