import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Insight } from '../../finance/insights';
import { RichText } from '../RichText';
import { useStyles } from '../styles';

const ICONS = { warn: 'alert-circle', info: 'information-circle', good: 'checkmark-circle' } as const;

export function InsightList({ insights }: { insights: Insight[] }) {
  const { theme, styles } = useStyles();
  if (!insights.length) return null;
  const colors = { warn: theme.warn, info: theme.accent, good: theme.positive };

  return (
    <View style={[styles.card, { gap: 0, paddingVertical: 4 }]}>
      {insights.map((insight, i) => (
        <View key={insight.id} style={[styles.row, { gap: 10, paddingVertical: 12, alignItems: 'flex-start' }, i > 0 && styles.divider]}>
          <Ionicons name={ICONS[insight.tone]} size={20} color={colors[insight.tone]} />
          <RichText parts={insight.parts} style={styles.text} />
        </View>
      ))}
    </View>
  );
}
