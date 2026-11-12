import { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { AllocationRow, currentAsTargets, DEVIATION_LIMIT, TargetShares } from '../../finance/allocation';
import type { PositionResult } from '../../finance/performance';
import { percent, points, shortPercent } from '../format';
import { Sheet } from '../Sheet';
import { useStyles } from '../styles';
import { positionColor } from './PositionList';

interface Props {
  visible: boolean;
  onClose: () => void;
  positions: PositionResult[];
  targets: TargetShares;
  allocation: Map<string, AllocationRow>;
  /** Leeres Objekt entfernt die Zielaufteilung */
  onChange: (targets: TargetShares) => void;
}

/** Wunschanteil je Position in ganzen Prozent festlegen; zusammen müssen es 100 % sein. */
export function AllocationSheet({ visible, onClose, positions, targets, allocation, onChange }: Props) {
  const { theme, styles } = useStyles();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const active = Object.keys(targets).length > 0;

  useEffect(() => {
    if (!visible) return;
    setInputs(Object.fromEntries(positions.map((p) => [p.instrument.isin, typeof targets[p.instrument.isin] === 'number' ? String(Math.round(targets[p.instrument.isin] * 100)) : ''])));
    // Nur beim Öffnen füllen, nicht bei jedem neuen Kurs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const sum = positions.reduce((s, p) => s + (Number(inputs[p.instrument.isin]) || 0), 0);
  const valid = sum === 100;
  const save = () => {
    Keyboard.dismiss();
    onChange(Object.fromEntries(positions.map((p) => [p.instrument.isin, (Number(inputs[p.instrument.isin]) || 0) / 100])));
    onClose();
  };
  const fillCurrent = () => setInputs(Object.fromEntries(Object.entries(currentAsTargets(positions)).map(([isin, n]) => [isin, String(n)])));

  return (
    <Sheet visible={visible} onClose={onClose} title="Zielaufteilung">
      <Text style={[styles.text, { color: theme.muted }]}>
        Lege fest, welchen Anteil jede Position an deinem Depot haben soll. Weicht eine Position um mehr als {shortPercent(DEVIATION_LIMIT)}-Punkte ab, weist dich die App darauf hin.
      </Text>

      <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
        {positions.map((p, i) => {
          const row = allocation.get(p.instrument.isin);
          return (
            <View key={p.instrument.isin} style={[styles.row, { paddingVertical: 12, gap: 10 }, i > 0 && styles.divider]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: positionColor(theme, i) }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.text }}>{p.instrument.shortName}</Text>
                <Text style={[styles.small, row?.off && { color: theme.warn }]}>
                  aktuell {percent(p.share)}
                  {row && Math.abs(row.deviation) >= 0.0005 ? ` · ${points(row.deviation)} ${row.deviation > 0 ? 'über' : 'unter'} Ziel` : ''}
                </Text>
              </View>
              <TextInput
                style={{ width: 64, textAlign: 'right', backgroundColor: theme.background, color: theme.text, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, fontVariant: ['tabular-nums'] }}
                value={inputs[p.instrument.isin] ?? ''}
                onChangeText={(v) => setInputs((prev) => ({ ...prev, [p.instrument.isin]: v.replace(/\D/g, '').slice(0, 3) }))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={theme.muted}
                selectTextOnFocus
                accessibilityLabel={`Wunschanteil ${p.instrument.shortName} in Prozent`}
              />
              <Text style={[styles.text, { color: theme.muted }]}>%</Text>
            </View>
          );
        })}
        <View style={[styles.row, styles.divider, { justifyContent: 'space-between', paddingVertical: 12 }]}>
          <Text style={[styles.text, { color: theme.muted }]}>Summe</Text>
          <Text style={[styles.text, styles.number, { fontWeight: '600', color: valid ? theme.positive : theme.warn }]}>{sum} %</Text>
        </View>
      </View>
      {!valid && <Text style={[styles.small, { color: theme.warn, paddingHorizontal: 4 }]}>Die Anteile müssen zusammen genau 100 % ergeben{sum < 100 ? `, es fehlen ${100 - sum} %` : `, es sind ${sum - 100} % zu viel`}.</Text>}

      <Pressable
        disabled={!valid}
        onPress={save}
        style={({ pressed }) => ({ backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: !valid ? 0.4 : pressed ? 0.7 : 1 })}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Speichern</Text>
      </Pressable>
      <Pressable onPress={fillCurrent} style={({ pressed }) => ({ backgroundColor: theme.chip, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>Heutige Aufteilung eintragen</Text>
      </Pressable>
      {active && (
        <Pressable
          onPress={() => {
            onChange({});
            onClose();
          }}
          style={{ paddingVertical: 8, alignItems: 'center' }}
        >
          <Text style={{ color: theme.negative, fontSize: 15, fontWeight: '600' }}>Zielaufteilung entfernen</Text>
        </Pressable>
      )}

      <Text style={[styles.small, { paddingHorizontal: 4 }]}>
        Die App zeigt nur die Abweichung. Ob und wie du sie ausgleichst, etwa über die Sparrate, entscheidest du. Kommt eine neue Position dazu, hat sie zunächst keinen
        Wunschanteil, bis du die Aufteilung hier anpasst.
      </Text>
    </Sheet>
  );
}
