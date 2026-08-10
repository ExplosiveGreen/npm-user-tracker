import { Text } from '@/components/ui/text';
import { useTheme } from '@/lib/theme-provider';
import { Pressable } from 'react-native';

// Compact header control. It labels the scheme a tap would switch to, which keeps
// the two-state behaviour honest even when the OS is doing the resolving.
function ThemeToggleButton() {
  const { resolved, isSystem, toggle } = useTheme();
  const target = resolved === 'dark' ? 'Light' : 'Dark';

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${target.toLowerCase()}${isSystem ? '' : ' (pinned)'}`}
    >
      <Text className="text-primary text-sm font-medium">{target}</Text>
    </Pressable>
  );
}

export { ThemeToggleButton };