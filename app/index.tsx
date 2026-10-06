import { safeRandomUUID } from '@tanstack/db';
import { useLiveQuery } from '@tanstack/react-db';
import { ThemeToggle } from '@/components/theme-toggle';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import {
  jobsCollection,
  npmUsersCollection,
  packagesCollection,
  packageVersionsCollection,
  type Job,
} from '@/db';
import {
  getNotificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/lib/notifications';
import { processJob, scanAllEnabled } from '@/lib/script';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Link, Stack } from 'expo-router';

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

// Notification setup banner: explains that tracking = notifications, surfaces
// the OS permission state, and offers a one-tap enable.
function NotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const supported = notificationsSupported();

  useEffect(() => {
    void getNotificationPermission()
      .then(setPermission)
      .catch(() => setPermission('denied'));
  }, []);

  if (!supported) return null;
  if (permission === 'granted') return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Notifications off</CardTitle>
      </CardHeader>
      <CardContent className="gap-2">
        <Text className="text-muted-foreground text-sm">
          Enable notifications to get alerted when a tracked author publishes a new release.
        </Text>
        <Button
          testID="enable-notifications"
          onPress={() =>
            void requestNotificationPermission().then((granted) =>
              setPermission(granted ? 'granted' : 'denied'),
            )
          }
        >
          <Text>Enable notifications</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

// Release history: the newest package versions across all tracked packages.
// package_versions is the source of truth — every version bump recorded by a
// scan lands here with its registry date.
function RecentUpdates() {
  const { data: versions } = useLiveQuery((q) => q.from({ v: packageVersionsCollection }));
  const { data: packages } = useLiveQuery((q) => q.from({ p: packagesCollection }));

  const publisherByPackage = new Map((packages ?? []).map((p) => [p.id, p.publisherId]));
  const recent = (versions ?? [])
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20);

  if (recent.length === 0) {
    return (
      <Card className="w-full">
        <CardContent>
          <Text className="text-muted-foreground text-sm">
            No releases yet. Add an npm user above and their latest releases will show up here.
          </Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <View className="gap-2">
      {recent.map((v) => (
        <Card key={`${v.packageId}/${v.version}`} className="w-full">
          <CardContent className="flex-row items-center justify-between">
            <View className="flex-1 gap-0.5">
              <Text className="font-medium">{v.packageId}</Text>
              <Text className="text-muted-foreground text-xs">
                {publisherByPackage.get(v.packageId) ?? 'unknown author'}
              </Text>
            </View>
            <View className="items-end gap-0.5">
              <Text className="text-sm">{v.version}</Text>
              <Text className="text-muted-foreground text-xs">{v.date.slice(0, 10)}</Text>
            </View>
          </CardContent>
        </Card>
      ))}
    </View>
  );
}

export default function Index() {
  const [username, setUsername] = useState("");
  const [checking, setChecking] = useState(false);
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

  const checkNow = () => {
    if (checking) return;
    setChecking(true);
    void scanAllEnabled().finally(() => setChecking(false));
  };

  const usersById = new Map((users ?? []).map((u) => [u.id, u.username]));
  const usernameOf = (job: Job) => usersById.get(job.npmUserId) ?? 'user';
  // Newest scan wins per user so each card shows its latest outcome.
  const jobsNewestFirst = (jobs ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestJobByUser = new Map<string, Job>();
  for (const job of jobsNewestFirst) {
    if (!latestJobByUser.has(job.npmUserId)) latestJobByUser.set(job.npmUserId, job);
  }
  const activeJobs = jobsNewestFirst.filter((job) => job.status !== 'success');

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
    <>
      <Stack.Screen options={{ title: 'npm user tracker', headerRight: () => <ThemeToggleButton /> }} />
      <SafeAreaProvider>
        <SafeAreaView className="bg-background flex-1">
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 p-4 pb-8"
            showsVerticalScrollIndicator={false}
          >
            <NotificationSetup />

            <View className="gap-2">
              <Text className="text-lg font-semibold">Needs attention</Text>
              {activeJobs.length === 0 ? (
                <Text className="text-muted-foreground text-sm">All clear — every scan succeeded.</Text>
              ) : (
                activeJobs.map((job) => (
                  <View key={job.id} className="gap-2">
                    <View className={`rounded-md px-3 py-2 ${jobStyle(job.status)}`}>
                      <Text>{jobLabel(job, usernameOf(job))}</Text>
                    </View>
                    {job.status === 'failed' && (
                      <Button testID="retry-scan" variant="outline" onPress={() => retryJob(job)}>
                        <Text>Retry scan</Text>
                      </Button>
                    )}
                    {job.status === 'no-data' && (
                      <Button testID="delete-user-button" variant="destructive" onPress={() => promptDeleteUser(job)}>
                        <Text>This user may not exist — delete?</Text>
                      </Button>
                    )}
                  </View>
                ))
              )}
            </View>

            <View className="gap-2">
              <Text className="text-lg font-semibold">Track an author</Text>
              <Input testID="username-input" onChangeText={setUsername} value={username} placeholder='npm username' />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Button testID="add-user" onPress={addUser} className="w-full">
                    <Text>Add user</Text>
                  </Button>
                </View>
                <View className="flex-1">
                  <Button testID="check-now" variant="outline" onPress={checkNow} disabled={checking} className="w-full">
                    <Text>{checking ? 'Checking…' : 'Check now'}</Text>
                  </Button>
                </View>
              </View>
              <Text className="text-muted-foreground text-xs">
                Enabled authors are rescanned hourly in the background. The switch on each author
                is the notification opt-out.
              </Text>
            </View>

            <View className="gap-2">
              <Text className="text-lg font-semibold">Tracked authors</Text>
              {(users ?? []).length === 0 && (
                <Text className="text-muted-foreground text-sm">Nobody tracked yet.</Text>
              )}
              {(users ?? []).map(({ id, username, enable }) => {
                const latest = latestJobByUser.get(id);
                return (
                  <Card key={id} className='w-full'>
                    <CardContent className='flex-row justify-between'>
                      <Text>{`username : ${username}`}</Text>
                      <View className="items-end gap-1">
                        {latest && <Text className="text-muted-foreground text-xs">{jobLabel(latest, username)}</Text>}
                        <Switch
                          checked={enable}
                          onCheckedChange={(e) =>
                            void npmUsersCollection.update(id, (draft) => {
                              draft.enable = e;
                            })
                          }
                        />
                      </View>
                    </CardContent>
                  </Card>
                );
              })}
            </View>

            <View className="gap-2">
              <Text className="text-lg font-semibold">Recent updates</Text>
              <RecentUpdates />
            </View>

            <View className="gap-2">
              <ThemeToggle />
              <Link asChild href={'/db'}>
                <Button testID="db-link" variant="link">
                  <Text>go to db page</Text>
                </Button>
              </Link>
            </View>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}
