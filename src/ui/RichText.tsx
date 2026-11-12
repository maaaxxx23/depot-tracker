import { StyleProp, Text, TextStyle, View } from 'react-native';
import { TextPart } from '../types';
import { eur, signedEur } from './format';
import { PrivateText } from './privacy';

type Token = { word: string } | { amount: number; signed?: boolean };

const WORD_GAP = 4;

/**
 * Satz mit eingebetteten Beträgen. Die Wörter werden einzeln umbrochen,
 * damit jeder Betrag für sich weichgezeichnet werden kann.
 */
export function RichText({ parts, style, amountStyle }: { parts: TextPart[]; style: StyleProp<TextStyle>; amountStyle?: StyleProp<TextStyle> }) {
  const tokens = parts.flatMap((p): Token[] => (typeof p === 'string' ? p.split(' ').filter(Boolean).map((word) => ({ word })) : [p]));

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', flex: 1 }}>
      {tokens.map((t, i) => {
        const next = tokens[i + 1];
        // Satzzeichen direkt hinter einem Betrag ohne Abstand anhängen
        const marginRight = next && 'word' in next && /^[.,;:!?)]/.test(next.word) ? 0 : WORD_GAP;
        return 'word' in t ? (
          <Text key={i} style={[style, { marginRight }]}>
            {t.word}
          </Text>
        ) : (
          <PrivateText key={i} containerStyle={{ marginRight }} style={[style, amountStyle]}>
            {t.signed ? signedEur(t.amount) : eur(t.amount)}
          </PrivateText>
        );
      })}
    </View>
  );
}
