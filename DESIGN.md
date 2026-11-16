# Gestaltungsrichtlinien

Die App soll **ruhig** wirken: alles Wichtige auf einen Blick, nichts drängt sich auf.
Jede neue Oberfläche wird an diesen Regeln gemessen. Sie sind über viele Iterationen
direkt am iPhone entstanden – im Zweifel gewinnt das, was auf dem Gerät ruhiger aussieht.

## Grundhaltung

- **Eine Seite.** Die App ist ein einziges Dashboard; Details öffnen sich als Blätter
  (`Sheet`), nie als neue Screens. Nichts navigiert, alles kommt zum Nutzer.
- **Beobachten, nicht bewerten.** Texte beschreiben („liegt 7 %-Punkte über deinem
  Wunschanteil"), sie empfehlen nie („kaufe nach"). Rechenergebnisse heißen
  „Rechnerisch: …" und beruhen immer auf den eigenen Vorgaben des Nutzers.
- **Generisch.** Nichts ist auf ein bestimmtes Depot zugeschnitten; alles muss mit
  fremden ETFs, anderen Beträgen und leeren Zuständen funktionieren (Demo-Depot).

## Farben (src/ui/theme.ts)

Alle Farben kommen aus dem Theme, nie fest in Komponenten. Hell und Dunkel sind
gleichberechtigt – jede Änderung in beiden Modi prüfen.

| Rolle | Hell | Dunkel | Verwendung |
| --- | --- | --- | --- |
| `accent` | `#B98200` | `#F2C14E` | Warmes Gold: primäre Buttons, aktive Chips, Links, Hervorhebungen. Schrift darauf immer `onAccent` (`#1C1708`). |
| `benchmark` | `#2F6FEB` | `#5B8DF6` | Blau nur für die Vergleichslinie (MSCI World) – hebt sich bewusst vom goldenen Depot ab. |
| `positive` / `negative` | Grün / Rot | | Nur für Gewinn/Verlust-Werte, nie dekorativ. |
| `warn` | Orange | | Beobachtungen, die Aufmerksamkeit verdienen (Abweichung, Rücksetzer). |
| `palette` | 5 Farben | | Eine Farbe je Position (`positionColor`), konsistent in Balken, Listen, Sparplänen und „Was steckt drin". Enthält bewusst **kein Gold und kein Grau**, damit sich Positionen immer vom Design abheben. |

- Gold ist die Stimme der App: ein goldener Button pro Blatt ist die Hauptaktion,
  alles andere bleibt `chip`-grau oder Text. Zwei goldene Flächen nebeneinander nur,
  wenn eine davon einen gewählten Zustand zeigt (gefüllt = gewählt, Rahmen = Alternative).
- Kartentitel sind **reiner Text, keine Icons** (ausprobiert und verworfen).

## Schrift und Zahlen

- Stile aus `src/ui/styles.ts`: `cardTitle` (17/600), `text` (15), `label` (13),
  `small` (12, gedämpft). Keine eigenen Schriftgrößen erfinden.
- Beträge immer mit `tabular-nums` (`styles.number`), Formatierung nur über
  `src/ui/format.ts` (`eur`, `signedEur`, `percent`, …) – nie von Hand formatieren.
- Vorzeichenbehaftete Werte (`+`/`−`) nur, wo die Richtung die Aussage ist.

## Privatsphäre ist Pflicht

Jeder Geldbetrag auf dem Bildschirm respektiert den Auge-Modus: `PrivateText`
(Weichzeichner) bzw. `RichText` für Beträge im Fließtext. Prozentwerte und Stückzahlen
dürfen sichtbar bleiben. Neue Komponenten mit Beträgen ohne `PrivateText` sind ein Fehler.
Einblendungen und Animationen warten hinter Sperre/Vorhang (`useShield`), statt unsichtbar
abzulaufen.

## Bewegung

- **Kurz und weich:** Standard sind 200–400 ms mit `easeInEaseOut`; Layoutwechsel über
  `LayoutAnimation` (250 ms), Einblendungen über `Animated` mit `useNativeDriver`.
- Bewegung hat einen Grund (Zustand wechselt, etwas kommt/geht) – nie als Dekoration.
  Vorbilder in der App: Vorhang (AppLock), tippender Betrag (TypedAmount), Klapp-Karte
  (MonthReviewCard).
- Nach Animationen darf nichts springen: Platzhalter halten die Größe (siehe TypedAmount).

## Haptik

`tapFeedback()` auf jedem Button, der etwas bestätigt oder wählt; `successFeedback()`
nach gelungenem Abruf. Nie auf reinen Navigations- oder Schließen-Gesten. Haptik ist
abschaltbar (Einstellung „Darstellung") – immer über `src/ui/haptics.ts`, nie direkt
expo-haptics aufrufen.

## Texte

- Deutsch, Du-Form, kurze Sätze. Karten erklären sich in einer Zeile; längere
  Erklärungen wandern in einen `InfoDot` (ⓘ) oder in Hilfe & FAQ (`src/help/content.ts`).
- Hilfe und FAQ werden bei jeder Funktionsänderung mitgepflegt – sie sind Teil des Features.
- Zurückhaltung bei Ausrufezeichen, keine Emojis in der App.

## Muster für neue Funktionen

1. Rechenlogik rein und testbar nach `src/finance/` (Tests in `scripts/check-math.ts`).
2. Dashboard-Karte klein und still; Details in ein `Sheet`. Erst ab Sichtbarkeit
   hinterfragen: Muss das dauerhaft zu sehen sein, oder reicht ein Zeitfenster
   (Monats-Rückblick), ein Hinweis (`InsightList`, max. 3) oder eine Zeile?
3. Alles Abschaltbare gehört unter „Zugang verwalten" (Schutz/Darstellung);
   Geräte-Einstellungen bleiben lokal, inhaltliche Einstellungen in die Sicherung.
4. Leere Zustände bedenken: ohne Zugang, ohne Zielaufteilung, ohne Historie.
5. Vor dem Urteil: auf dem iPhone ansehen (Expo Go), hell und dunkel.
