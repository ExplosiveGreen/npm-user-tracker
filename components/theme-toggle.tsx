import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme-provider';
import { View } from 'react-native';

// Two-state dark-mode control over the article's three-state model. The switch
// mirrors what is currently on screen; flipping it either pins the opposite scheme
// or releases back to the OS, whichever the theme logic decides.
function ThemeToggle() {
  const { resolved, isSystem, toggle } = useTheme();

  return (
    <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <View className="gap-0.5">
        <Text className="text-sm font-medium">Dark mode</Text>
        <Text className="text-muted-foreground text-xs">
          {isSystem ? `Following system (${resolved})` : `Set to ${resolved}`}
        </Text>
      </View>
      <Switch
        testID="dark-mode-switch"
        checked={resolved === 'dark'}
        onCheckedChange={() => toggle()}
      />
    </View>
  );
}

export { ThemeToggle };