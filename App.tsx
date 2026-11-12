import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PrivacyProvider } from './src/ui/privacy';

export default function App() {
  return (
    <SafeAreaProvider>
      <PrivacyProvider>
        <StatusBar style="auto" />
        <DashboardScreen />
      </PrivacyProvider>
    </SafeAreaProvider>
  );
}
