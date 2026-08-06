import { safeRandomUUID } from '@tanstack/db';
import { useLiveQuery } from '@tanstack/react-db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { jobsCollection, npmUsersCollection, type Job } from '@/db';
import { processJob } from '@/lib/script';
import { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';

const jobLabel = (job: Job, username: string): string => {
  switch (job.status) {
    case 'queued':
      return `Queued: scanning ${username}…`;
    case 'running':
      return `Scanning ${username}…`;
    case 'success':
      return `Done: ${username} (${job.authorTotal} author, ${job.maintainerTotal} maintainer)`;
    case 'failed':
      return `Scan failed for ${username}: ${job.error ?? 'unknown error'}`;
    case 'no-data':
      return `No npm packages found for ${username}.`;
  }
};

export default function Index() {
  const [username, setUsername] = useState("");
  const { data: users } = useLiveQuery((q) =>
    q.from({ users: npmUsersCollection }).select(({ users }) => ({
      id: users.id,
      username: users.username,
      enable: users.enable,
    })),
  );
  const { data: jobs } = useLiveQuery((q) => q.from({ jobs: jobsCollection }));

  const addUser = () => {
    if (!username.trim()) return;
    const userId = safeRandomUUID();
    npmUsersCollection.insert({
      id: userId,
      username: username.trim(),
      email: null,
      enable: true,
    });
    const jobId = safeRandomUUID();
    jobsCollection.insert({
      id: jobId,
      npmUserId: userId,
      status: 'queued',
      error: null,
      authorTotal: 0,
      maintainerTotal: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });
    // Kick the job off immediately for visible feedback; the registered
    // background task covers any still-queued work.
    void processJob(jobId);
    setUsername("");
  };

  const usersById = new Map((users ?? []).map((u) => [u.id, u.username]));
  const usernameOf = (job: Job) => usersById.get(job.npmUserId) ?? 'user';
  const latestJobByUser = new Map<string, Job>();
  for (const job of jobs ?? []) {
    if (!latestJobByUser.has(job.npmUserId)) latestJobByUser.set(job.npmUserId, job);
  }
  const activeJobs = (jobs ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((job) =>
      job.status !== 'success',
    );

  const retryJob = (job: Job) => {
    jobsCollection.update(job.id, (draft) => {
      draft.status = 'queued';
      draft.error = null;
      draft.startedAt = null;
      draft.finishedAt = null;
      draft.authorTotal = 0;
      draft.maintainerTotal = 0;
    });
    void processJob(job.id);
  };

  const promptDeleteUser = (job: Job) => {
    Alert.alert(
      "This user might not exist",
      "No npm packages were found for this username. It may not exist or have a typo. Do you want to delete it?",
      [
        { text: "Keep", style: "cancel", onPress: () => jobsCollection.delete(job.id) },
        {
          text: "Delete user",
          style: "destructive",
          onPress: () => {
            npmUsersCollection.delete(job.npmUserId);
            jobsCollection.delete(job.id);
          },
        },
      ],
    );
  };

  const jobStyle = (status: Job['status']): string => {
    switch (status) {
      case 'running':
      case 'queued':
        return 'bg-primary text-primary-foreground';
      case 'success':
        return 'bg-border text-foreground';
      case 'failed':
        return 'bg-destructive text-white';
      case 'no-data':
        return 'bg-muted text-foreground border border-dashed';
    }
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView className="bg-background flex-1">
        <View className="gap-2 p-4">
          {activeJobs.map((job) => (
            <View key={job.id} className="gap-2">
              <View className={`rounded-md px-3 py-2 ${jobStyle(job.status)}`}>
                <Text>{jobLabel(job, usernameOf(job))}</Text>
              </View>
              {job.status === 'failed' && (
                <Button variant="outline" onPress={() => retryJob(job)}>
                  <Text>Retry scan</Text>
                </Button>
              )}
              {job.status === 'no-data' && (
                <Button variant="destructive" onPress={() => promptDeleteUser(job)}>
                  <Text>This user may not exist — delete?</Text>
                </Button>
              )}
            </View>
          ))}
        </View>
        <Input onChangeText={setUsername} value={username} placeholder='username' />
        <Button onPress={addUser} className="my-2">
          <Text>Add user</Text>
        </Button>
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4 pb-8"
          showsVerticalScrollIndicator={false}
        >
          {(users ?? []).map(({ id, username, enable }) => {
            const latest = latestJobByUser.get(id);
            return (
              <Card key={id} className='w-full'>
                <CardContent className='flex-row justify-between'>
                  <Text>{`username : ${username}`}</Text>
                  <View className="items-end gap-1">
                    {latest && <Text className="text-muted-foreground text-xs">{jobLabel(latest, username)}</Text>}
                    <Switch
                      onValueChange={(e) =>
                        void npmUsersCollection.update(id, (draft) => {
                          draft.enable = e;
                        })
                      }
                      value={enable}
                    />
                  </View>
                </CardContent>
              </Card>
            );
          })}
          <Link href={'/db'}>go to db page</Link>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}