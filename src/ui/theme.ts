import { useEffectiveScheme } from './appearance';

const light = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  text: '#111114',
  muted: '#6B6B76',
  border: '#E3E3E8',
  // Warmes Gold als Akzent, an comdirect angelehnt; Schrift auf Gold nutzt onAccent
  accent: '#B98200',
  onAccent: '#1C1708',
  benchmark: '#E08A1E',
  invested: '#9A9AA6',
  sale: '#8B5CF6',
  // Hilfebereich: eigenes warmes Goldgelb (bewusst nicht das comdirect-Gelb)
  help: '#B98200',
  helpSoft: 'rgba(217, 154, 0, 0.14)',
  positive: '#1A8F4E',
  negative: '#D1342F',
  chip: '#E6E6EC',
  warn: '#C77700',
  // Aufteilungsbalken, eine Farbe je Position
  palette: ['#2F6FEB', '#21A39A', '#8B5CF6', '#E0A21E', '#9A9AA6'],
};

const dark: typeof light = {
  background: '#000000',
  card: '#1C1C1F',
  text: '#F4F4F6',
  muted: '#9C9CA6',
  border: '#2E2E33',
  accent: '#F2C14E',
  onAccent: '#1C1708',
  benchmark: '#F2A444',
  invested: '#77777F',
  sale: '#A78BFA',
  help: '#F2C14E',
  helpSoft: 'rgba(242, 193, 78, 0.16)',
  positive: '#3CC37A',
  negative: '#FF6B61',
  chip: '#2C2C31',
  warn: '#F2A444',
  palette: ['#5B8DF6', '#35C2B6', '#A78BFA', '#F2C14E', '#77777F'],
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useEffectiveScheme() === 'dark' ? dark : light;
}
