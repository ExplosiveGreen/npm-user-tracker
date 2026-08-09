import { getPref, setPref } from '@/lib/prefs';
import { THEME } from '@/lib/theme';
import * as SystemUI from 'expo-system-ui';
import { useColorScheme as useNativewindColorScheme } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform, useColorScheme } from 'react-native';

export type Scheme = 'light' | 'dark';

/** The stored preference; null means "follow the OS". */
export type ColorSchemeOverride = Scheme | null;

const OVERRIDE_KEY = 'color-scheme-override';

const other = (scheme: Scheme): Scheme => (scheme === 'dark' ? 'light' : 'dark');

type ThemeContextValue = {
  /** The user's stored preference; null means "follow the OS". */
  override: ColorSchemeOverride;
  /** The OS color scheme, read live from the device. */
  system: Scheme;
  /** What the user is actually seeing: the override when pinned, otherwise the OS. */
  resolved: Scheme;
  isSystem: boolean;
  /** Two-state toggle over the three-state model — see ThemeProvider for the rules. */
  toggle: () => void;
  setOverride: (scheme: Scheme) => void;
  clearOverride: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Owns the theme model from "Dark mode toggles: two states are enough" (Lea Verou).
 * Underneath there are three states (a `light`/`dark` override, or none = system),
 * but the UI only ever shows two: the current scheme and the one a press produces.
 *
 * The underlying model is persisted, and the override is only ever cleared at user
 * interaction time — an override that later coincides with the OS is kept, so users
 * on scheduled OS switching can still pin a scheme.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const [override, setOverrideState] = useState<ColorSchemeOverride>(null);
  // Rn's useColorScheme is the OS signal. On web (prefers-color-scheme) it stays
  // truthful even while a pin is active; on native it does too unless we have
  // applied an override via our NativeWind mirror below.
  const rawSystem = useColorScheme();
  const system: Scheme = rawSystem === 'dark' ? 'dark' : 'light';
  const { setColorScheme } = useNativewindColorScheme();

  // Hydrate the persisted preference on mount.
  useEffect(() => {
    const stored = getPref(OVERRIDE_KEY);
    setOverrideState(stored === 'light' || stored === 'dark' ? stored : null);
  }, []);

  const resolved = override ?? system;

  // Mirror the resolved scheme into NativeWind so the `dark:` variants and the
  // CSS-variable palette switch in lockstep. "system" hands control back to
  // NativeWind's own OS-following (prefers-color-scheme on web, Appearance on native).
  useEffect(() => {
    setColorScheme(override === null ? 'system' : override);
  }, [override, setColorScheme]);

  // Keep the native root view background in sync so navigation never flashes white.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void SystemUI.setBackgroundColorAsync(
      resolved === 'dark' ? THEME.dark.background : THEME.light.background,
    );
  }, [resolved]);

  const setOverride = useCallback((scheme: Scheme) => {
    setOverrideState(scheme);
    setPref(OVERRIDE_KEY, scheme);
  }, []);

  const clearOverride = useCallback(() => {
    setOverrideState(null);
    setPref(OVERRIDE_KEY, null);
  }, []);

  /**
   * The article's toggle, evaluated only on press: the target is the opposite of
   * what's currently on screen. If that target is exactly what the OS says, there
   * is nothing to pin — release back to the system. Otherwise record it as a
   * literal override. On native a live pin hides the OS from RN, so there the only
   * safe move is to release; web always sees the true OS and follows the exact rule.
   */
  const toggle = useCallback(() => {
    const target = other(resolved);
    if (override === null || Platform.OS === 'web') {
      if (target === system) clearOverride();
      else setOverride(target);
    } else {
      clearOverride();
    }
  }, [override, resolved, system, clearOverride, setOverride]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      override,
      system,
      resolved,
      isSystem: override === null,
      toggle,
      setOverride,
      clearOverride,
    }),
    [override, system, resolved, toggle, setOverride, clearOverride],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}