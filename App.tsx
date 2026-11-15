import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AppearanceProvider, useEffectiveScheme } from './src/ui/appearance';
import { AppLock } from './src/ui/AppLock';
import { PrivacyProvider } from './src/ui/privacy';

/** Statusleiste passend zur gewählten Darstellung, nicht nur zur Systemeinstellung. */
function ThemedStatusBar() {
  return <StatusBar style={useEffectiveScheme() === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <PrivacyProvider>
          <ThemedStatusBar />
          <AppLock>
            <DashboardScreen />
          </AppLock>
        </PrivacyProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
