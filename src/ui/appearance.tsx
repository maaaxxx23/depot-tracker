import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { AppearanceMode, appearancePreference } from '../data/store';

const ModeContext = createContext<AppearanceMode>('system');
const SetModeContext = createContext<(mode: AppearanceMode) => void>(() => {});

/** Merkt sich die gewählte Darstellung (Automatisch, Hell, Dunkel). */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AppearanceMode>('system');

  useEffect(() => {
    appearancePreference.get().then(setMode).catch(() => {});
  }, []);

  const change = useCallback((next: AppearanceMode) => {
    setMode(next);
    appearancePreference.set(next).catch(() => {});
  }, []);

  return (
    <ModeContext.Provider value={mode}>
      <SetModeContext.Provider value={change}>{children}</SetModeContext.Provider>
    </ModeContext.Provider>
  );
}

export function useAppearance() {
  return { mode: useContext(ModeContext), setMode: useContext(SetModeContext) };
}

/** Tatsächliches Farbschema: die Wahl der App, bei „Automatisch“ die iOS-Einstellung. */
export function useEffectiveScheme(): 'light' | 'dark' {
  const mode = useContext(ModeContext);
  const system = useColorScheme();
  if (mode === 'system') return system === 'dark' ? 'dark' : 'light';
  return mode;
}
