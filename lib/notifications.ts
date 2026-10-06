import { Data, Effect } from "effect";
import { Platform } from "react-native";
import * as Device from "expo-device";

export type NotificationPermission = "granted" | "denied" | "undetermined";

// expo-notifications resolves a topic-subscription native module at import
// time that Expo Go does not ship: a static import redboxes there. Load it
// lazily and degrade to no-op notifications when unavailable — the release
// build (full native modules) is unaffected.
type NotificationsModule = typeof import("expo-notifications");
const Notifications: NotificationsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
})();

// Local-only notifications: no push server. The background scan detects new
// releases and fires an on-device notification immediately.
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Physical devices only — simulators and web cannot display notifications.
// Also false when the native module is missing (e.g. Expo Go), where every
// notification call below safely no-ops.
export function notificationsSupported(): boolean {
  if (!Notifications) return false;
  if (Platform.OS === "web") return false;
  return Device.isDevice;
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!Notifications || !notificationsSupported()) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications || !notificationsSupported()) return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export class NotificationError extends Data.TaggedError("NotificationError")<{
  readonly message: string;
}> {}

export interface ReleaseNotification {
  packageId: string;
  version: string;
  isNewPackage: boolean;
}

// Fires one summary notification per scan covering all new/updated packages so
// a prolific author can't spam the notification tray one package at a time.
// Never fails the caller — permission and scheduling problems just skip.
export const notifyReleases = (
  username: string,
  releases: ReadonlyArray<ReleaseNotification>,
): Effect.Effect<void, NotificationError> =>
  Effect.gen(function* () {
    const N = Notifications;
    if (!N) return;
    if (releases.length === 0) return;
    if (!notificationsSupported()) return;

    const { status } = yield* Effect.tryPromise({
      try: () => N.getPermissionsAsync(),
      catch: (cause) => new NotificationError({ message: String(cause) }),
    });
    if (status !== "granted") return;

    const updated = releases.filter((r) => !r.isNewPackage);
    const fresh = releases.filter((r) => r.isNewPackage);
    const title =
      updated.length > 0 && fresh.length > 0
        ? `${username}: ${updated.length} updated, ${fresh.length} new`
        : updated.length > 0
          ? `${username}: ${updated.length} package${updated.length === 1 ? "" : "s"} updated`
          : `${username}: ${fresh.length} new package${fresh.length === 1 ? "" : "s"}`;

    const lines = releases.slice(0, 5).map((r) =>
      r.isNewPackage ? `${r.packageId} (new) ${r.version}` : `${r.packageId} → ${r.version}`,
    );
    const overflow = releases.length > lines.length ? ` +${releases.length - lines.length} more` : "";

    yield* Effect.tryPromise({
      try: () =>
        N.scheduleNotificationAsync({
          content: { title, body: `${lines.join("\n")}${overflow}` },
          trigger: null,
        }),
      catch: (cause) => new NotificationError({ message: String(cause) }),
    });
  });
