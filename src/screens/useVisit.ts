import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { visitStore } from '../data/store';
import { NEW_VISIT_AFTER_MS, takeSnapshot, VisitBannerContent, visitChange, VisitSnapshot } from '../finance/visit';
import type { PortfolioData } from '../types';

/** Spätestens so lange nach dem Öffnen erscheint das Banner, auch wenn Yahoo noch nicht geantwortet hat. */
const BANNER_WAIT_MS = 8000;

/**
 * Merkt sich Bestand und Kurse, wenn die App in den Hintergrund geht. Wird sie nach mindestens
 * einer Stunde wieder geöffnet, beginnt ein neuer Besuch: Verglichen wird dann mit dem Ende des
 * letzten Besuchs. Kurzes Wechseln in eine andere App zählt nicht.
 *
 * @param marketSettled zählt hoch, sobald ein Abruf aktueller Kurse fertig ist; das Banner wartet darauf
 */
export function useVisit(data: PortfolioData, marketSettled: number) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const [baseline, setBaseline] = useState<VisitSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [waited, setWaited] = useState(false);
  // id: neues Banner auch bei gleichem Inhalt (z. B. zweimal hintereinander lang gedrückt)
  const [banner, setBannerState] = useState<(VisitBannerContent & { id: number }) | null>(null);
  const bannerId = useRef(0);
  const setBanner = (content: VisitBannerContent) => setBannerState({ ...content, id: ++bannerId.current });
  const settledAtStart = useRef(0);
  const settledRef = useRef(marketSettled);
  settledRef.current = marketSettled;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const begin = async () => {
      try {
        const last = await visitStore.getLast();
        if (last && Date.now() - Date.parse(last.at) >= NEW_VISIT_AFTER_MS) {
          // Neuer Besuch: Vergleich mit dem Ende des letzten
          await visitStore.setBaseline(last);
          setBaseline(last);
          settledAtStart.current = settledRef.current;
          setWaited(false);
          setPending(true);
          clearTimeout(timer);
          timer = setTimeout(() => setWaited(true), BANNER_WAIT_MS);
        } else {
          setBaseline(await visitStore.getBaseline());
        }
      } catch {
        // Ohne gespeicherten Besuch gibt es eben keinen Vergleich
      }
    };
    begin();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') begin();
      if (state === 'background') {
        const snapshot = takeSnapshot(dataRef.current);
        if (snapshot) visitStore.setLast(snapshot).catch(() => {});
      }
    });
    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  const change = useMemo(() => visitChange(baseline, data), [baseline, data]);

  // Banner einmal pro Besuch, sobald die aktuellen Kurse da sind (oder nach kurzer Wartezeit)
  useEffect(() => {
    if (!pending) return;
    if (marketSettled <= settledAtStart.current && !waited) return;
    setPending(false);
    if (change) setBanner({ kind: 'change', ...change });
  }, [pending, marketSettled, waited, change]);

  /**
   * Banner auf Wunsch (langer Druck auf den Depotwert): dieselbe Veränderung wie in der Zeile
   * unter dem Depotwert, sonst der Vergleich mit dem letzten Verlassen der App, sonst der Hinweis,
   * dass es keine neuen Kurse gibt. Nur im Demo-Modus ein gekennzeichnetes Beispiel.
   */
  const sampleCount = useRef(0);
  const show = async (depotValue: number) => {
    const isDemo = dataRef.current.source.kind === 'demo';
    if (!isDemo) {
      const last = await visitStore.getLast().catch(() => null);
      const real = change ?? visitChange(last, dataRef.current);
      setBanner(real ? { kind: 'change', ...real } : { kind: 'none', since: baseline?.at ?? last?.at ?? null });
      return;
    }
    const up = sampleCount.current++ % 2 === 0;
    const rel = up ? 0.0062 : -0.0085;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(21, 30, 0, 0);
    setBanner({ kind: 'change', amount: (depotValue || 10000) * rel, rel, since: yesterday.toISOString(), estimate: true, sample: true });
  };

  return { change, banner, dismissBanner: () => setBannerState(null), show };
}
