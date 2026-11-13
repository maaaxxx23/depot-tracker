import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { AppLock } from './src/ui/AppLock';
import { PrivacyProvider } from './src/ui/privacy';

export default function App() {
  return (
    <SafeAreaProvider>
      <PrivacyProvider>
        <StatusBar style="auto" />
        <AppLock>
          <DashboardScreen />
        </AppLock>
      </PrivacyProvider>
    </SafeAreaProvider>
  );
}
