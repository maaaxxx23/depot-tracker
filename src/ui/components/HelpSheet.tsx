import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { LayoutAnimation, Pressable, Text, View } from 'react-native';
import { FAQ, GUIDE } from '../../help/content';
import { Sheet } from '../Sheet';
import { font, radius, useStyles } from '../styles';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Schließt die Hilfe und zeigt das Willkommens-Blatt samt Tour erneut */
  onReplayWelcome?: () => void;
}

type Tab = 'guide' | 'faq';

/**
 * Anleitung und häufige Fragen, als eigener Bereich. Überschriften und Fragen heben sich
 * durch Goldgelb, Größe und Gewicht deutlich vom Fließtext ab; der Text selbst ist ruhiger.
 */
export function HelpSheet({ visible, onClose, onReplayWelcome }: Props) {
  const { theme, styles } = useStyles();
  const [tab, setTab] = useState<Tab>('guide');
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    setOpen((current) => (current === id ? null : id));
  };

  const bodyText = { fontSize: font.body, lineHeight: 22, color: theme.muted } as const;

  const paragraph = (text: string, key: number) => {
    const bullet = text.startsWith('• ');
    const step = /^(\d+)\. (.*)$/.exec(text);
    if (bullet || step) {
      return (
        <View key={key} style={[styles.row, { alignItems: 'flex-start', gap: 10 }]}>
          {step ? (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.helpSoft, alignItems: 'center', justifyContent: 'center', marginTop: 0 }}>
              <Text style={{ fontSize: font.small, fontWeight: '700', color: theme.help }}>{step[1]}</Text>
            </View>
          ) : (
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.help, marginTop: 8, marginHorizontal: 2 }} />
          )}
          <Text style={[bodyText, { flex: 1 }]}>{step ? step[2] : text.slice(2)}</Text>
        </View>
      );
    }
    return (
      <Text key={key} style={bodyText}>
        {text}
      </Text>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Anleitung & FAQ">
      {onReplayWelcome && (
        <Pressable onPress={onReplayWelcome} accessibilityRole="button" hitSlop={4} style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 4, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontSize: font.body, color: theme.accent, fontWeight: '600' }}>Willkommens-Tour erneut ansehen</Text>
        </Pressable>
      )}
      {/* Umschalter wie beim Chart */}
      <View style={{ flexDirection: 'row', backgroundColor: theme.chip, borderRadius: radius.control, padding: 3 }}>
        {(['guide', 'faq'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            accessibilityState={{ selected: tab === t }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.small, alignItems: 'center', backgroundColor: tab === t ? theme.card : 'transparent' }}
          >
            <Text style={{ fontSize: font.body, color: tab === t ? theme.text : theme.muted, fontWeight: tab === t ? '700' : '500' }}>
              {t === 'guide' ? 'Anleitung' : 'Häufige Fragen'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'guide'
        ? GUIDE.map((section, index) => (
            <View key={section.title} style={[styles.card, { gap: 0, padding: 0, overflow: 'hidden' }]}>
              {/* Kopf des Kapitels: Symbol auf Goldgelb, Nummer, Titel */}
              <View style={[styles.row, { gap: 12, padding: 16, paddingBottom: 14, backgroundColor: theme.helpSoft }]}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: theme.help, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={section.icon} size={21} color={theme.card} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontSize: font.small, fontWeight: '700', letterSpacing: 0.8, color: theme.help }}>
                    {`KAPITEL ${String(index + 1).padStart(2, '0')}`}
                  </Text>
                  <Text style={{ fontSize: font.heading, fontWeight: '700', color: theme.text }}>{section.title}</Text>
                </View>
              </View>
              <View style={{ gap: 10, padding: 16, paddingTop: 14 }}>{section.body.map(paragraph)}</View>
            </View>
          ))
        : FAQ.map((group) => (
            <View key={group.title} style={{ gap: 8, marginTop: 6 }}>
              {/* Gruppenüberschrift: goldgelber Balken und Titel */}
              <View style={[styles.row, { gap: 8, marginLeft: 2 }]}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: theme.help }} />
                <Text style={{ fontSize: font.title, fontWeight: '700', color: theme.text }}>{group.title}</Text>
                <Text style={[styles.small, { marginLeft: 'auto', marginRight: 4 }]}>{group.items.length} Fragen</Text>
              </View>
              <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
                {group.items.map((item, i) => {
                  const id = `${group.title}/${item.question}`;
                  const expanded = open === id;
                  return (
                    <View key={id} style={i > 0 ? styles.divider : undefined}>
                      <Pressable
                        onPress={() => toggle(id)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded }}
                        style={({ pressed }) => [styles.row, { gap: 12, paddingVertical: 14, alignItems: 'flex-start', opacity: pressed ? 0.6 : 1 }]}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: radius.button,
                            marginTop: -1,
                            backgroundColor: expanded ? theme.help : theme.helpSoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: font.label, fontWeight: '800', color: expanded ? theme.card : theme.help }}>?</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: font.button, lineHeight: 22, fontWeight: '600', color: theme.text }}>{item.question}</Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? theme.help : theme.muted} style={{ marginTop: 2 }} />
                      </Pressable>
                      {expanded && (
                        // Antwort eingerückt, mit goldgelber Linie links: klar als Antwort zur Frage erkennbar
                        <View style={{ gap: 8, marginLeft: 11, paddingLeft: 23, paddingBottom: 16, borderLeftWidth: 2, borderLeftColor: theme.help }}>
                          {item.answer.map(paragraph)}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

      <Text style={[styles.small, { textAlign: 'center', marginTop: 8 }]}>Die App liest nur. Für Anlageentscheidungen ist sie keine Beratung.</Text>
    </Sheet>
  );
}
