import { Data, Effect } from "effect";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as Device from "expo-device";

export type NotificationPermission = "granted" | "denied" | "undetermined";

// Local-only notifications: no push server. The background scan detects new
// releases and fires an on-device notification immediately.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Physical devices only — simulators and web cannot display notifications.
export function notificationsSupported(): boolean {
  if (Platform.OS === "web") return false;
  return Device.isDevice;
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "undetermined";
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
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
    if (releases.length === 0) return;
    if (!notificationsSupported()) return;

    const { status } = yield* Effect.tryPromise({
      try: () => Notifications.getPermissionsAsync(),
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
        Notifications.scheduleNotificationAsync({
          content: { title, body: `${lines.join("\n")}${overflow}` },
          trigger: null,
        }),
      catch: (cause) => new NotificationError({ message: String(cause) }),
    });
  });
