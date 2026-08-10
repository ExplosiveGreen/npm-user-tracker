import { cn } from '@/lib/utils';
import { Pressable, View } from 'react-native';

type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
} & React.ComponentProps<typeof Pressable>;

// Themed on/off control: track uses the primary/input tokens, thumb the background
// token, so it reads correctly in both light and dark palettes.
function Switch({ checked, onCheckedChange, disabled, className, ...props }: SwitchProps) {
  return (
    <Pressable
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onCheckedChange(!checked)}
      className={cn(
        'h-6 w-10 flex-row items-center rounded-full border-2 border-transparent transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      <View
        className={cn(
          'h-5 w-5 rounded-full bg-background shadow-sm shadow-black/30 transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </Pressable>
  );
}

export { Switch, type SwitchProps };