import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ShieldOverlay } from './AppLock';
import { useTheme } from './theme';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Detailblatt, das von unten hochkommt (auf iOS das native Sheet). */
export function Sheet({ visible, title, onClose, children }: Props) {
  const theme = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Schließen">
            <Ionicons name="close-circle" size={28} color={theme.muted} />
          </Pressable>
        </View>
        {/* Tastatur schiebt den Inhalt hoch; Wischen nach unten oder Tippen daneben schließt sie */}
        <ScrollView
          contentContainerStyle={styles.content}
          automaticallyAdjustKeyboardInsets
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* Blätter sind native Modals und liegen über den Overlays der App:
            Sperre und Vorhang decken sie deshalb hier selbst ab */}
        <ShieldOverlay />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  title: { fontSize: 22, fontWeight: '700', flex: 1, marginRight: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
});
