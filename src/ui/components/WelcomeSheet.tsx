import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { tapFeedback } from '../haptics';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';

interface Props {
  visible: boolean;
  /** Schließt das Blatt; es kommt danach nie wieder */
  onDone: () => void;
  /** Schließt das Blatt und startet die Spotlight-Tour über dem Demo-Depot */
  onTour: () => void;
  /** Schließt das Blatt und öffnet direkt „Anleitung & FAQ“ */
  onHelp: () => void;
}

/** Einmalige Willkommens-Tour beim ersten Start: Was die App ist, wie man verbindet, Sicherheit. */
export function WelcomeSheet({ visible, onDone, onTour, onHelp }: Props) {
  const { theme, styles } = useStyles();

  const card = (icon: ComponentProps<typeof Ionicons>['name'], title: string, text: string) => (
    <View style={[styles.card, { gap: 8 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <Ionicons name={icon} size={20} color={theme.accent} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.text}>{text}</Text>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onDone} title="Willkommen">
      {card(
        'pie-chart-outline',
        'Dein Depot auf einen Blick',
        'Depot Tracker zeigt dein comdirect-Depot ruhig und übersichtlich: Wert und Verlauf, Sparpläne, dein Sparziel und was wirklich in deinen ETFs steckt. Bis du dein Depot verbindest, siehst du ein Demo-Depot mit erfundenen Zahlen zum Erkunden.',
      )}
      {card(
        'link-outline',
        'Eigenes Depot verbinden',
        'Dafür brauchst du ein comdirect-Konto und schaltest einmalig den API-Zugang im Onlinebanking frei. Danach unten auf „comdirect verbinden“ tippen – die Schritt-für-Schritt-Anleitung findest du jederzeit unter „Anleitung & FAQ“.',
      )}
      {card(
        'lock-closed-outline',
        'Deine Daten gehören dir',
        'Die App liest nur und kann keine Aufträge erteilen. Zugangsdaten bleiben im Schlüsselbund dieses iPhones, die PIN zusätzlich mit Face ID geschützt. Es gibt keinen Server, deine Daten verlassen das iPhone nicht.',
      )}
      <Pressable
        onPress={() => {
          tapFeedback();
          onTour();
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: '600' }}>Kurze Tour durch die App</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          tapFeedback();
          onDone();
        }}
        accessibilityRole="button"
        style={({ pressed }) => ({ borderColor: theme.accent, borderWidth: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}
      >
        <Text style={{ color: theme.accent, fontSize: 16, fontWeight: '600' }}>Direkt loslegen</Text>
      </Pressable>
      <Pressable onPress={onHelp} accessibilityRole="button" style={{ paddingVertical: 6, alignItems: 'center' }}>
        <Text style={[styles.text, { color: theme.accent, fontWeight: '600' }]}>Erst die Anleitung lesen</Text>
      </Pressable>
    </Sheet>
  );
}
