# Depot Tracker

Private iOS-App (Expo / React Native), die ein comdirect-Depot ruhig und übersichtlich auf
einen Blick zeigt: Depotwert und Verlauf, Vergleich mit dem MSCI World, Sparrate und Sparziel
samt Entnahme-Rechner, Positionen mit Zielaufteilung – und was wirklich in den ETFs steckt
(Länder, Branchen, größte Firmen, Überschneidungen). Verteilt wird über TestFlight.

## Grundprinzipien

- **Rein lesend.** Die App nutzt ausschließlich lesende Endpunkte der offiziellen
  comdirect-REST-API. Eine Allow-List in `src/comdirect/api.ts` verhindert technisch jeden
  Aufruf von Order-Endpunkten.
- **Kein Server.** Es gibt kein Backend. Alle Daten liegen lokal auf dem iPhone
  (AsyncStorage), Zugangsdaten im iOS-Schlüsselbund (`expo-secure-store`), die Banking-PIN
  zusätzlich mit `requireAuthentication` (Face ID) geschützt.
- **Sperr-Schutz.** comdirect sperrt den Zugang nach 5 TAN-Challenges ohne Freigabe bzw.
  3 falschen TANs. Die App fordert deshalb nie automatisch eine Challenge an, zählt offene
  Challenges mit (`openChallenges` in `src/data/store.ts`) und warnt früh.
- **Keine Anlageberatung.** Alle Hochrechnungen (Sparziel, Entnahme) sind als neutrale
  Modellrechnungen formuliert.

## Warum TypeScript/Expo statt Swift?

Eine bewusste, pragmatische Entscheidung:

- **Entwickelt wird auf Windows.** Swift braucht Xcode, Xcode braucht einen Mac. Mit Expo
  entsteht die iOS-App komplett ohne Mac: entwickelt auf dem PC, gebaut in der Expo-Cloud
  (EAS), verteilt über TestFlight.
- **Iterationstempo.** Über Expo Go ist jede Änderung Sekunden später auf dem iPhone, ohne
  Build-Schritt. Die App ist in vielen kleinen Iterationen direkt am Gerät entstanden.
- **Der Kern ist Rechenlogik.** Finanzmathematik, API-Aufrufe, eine Seite UI – dafür reicht
  React Native locker; die Animationen laufen über den nativen Treiber. TypeScript sichert
  die Rechenlogik ab, und die Testskripte laufen mit Node direkt auf dem PC.

Grenze des Ansatzes: Features, die natives iOS verlangen (z. B. ein Home-Screen-Widget),
bräuchten ein natives Zusatzmodul. Dafür bliebe mit derselben Codebasis der Weg zu einer
Android-Version offen.

## Entwicklung starten

Voraussetzungen: Node ≥ 20, ein iPhone mit Expo Go (die App wird nur auf iOS getestet).

```bash
npm install
npx expo start
```

QR-Code mit Expo Go scannen. Ohne comdirect-Zugang zeigt die App ein Demo-Depot
(`src/demo/demoData.ts`) samt Willkommens-Tour – damit lässt sich fast alles entwickeln und
testen, ohne echte Bankdaten.

## Tests

Zwei eigenständige Skripte (kein Test-Framework, bewusst schlicht):

```bash
npx tsc --noEmit                      # Typprüfung
npx tsx scripts/check-math.ts         # Finanzmathematik (Rendite, Ziel, Entnahme, ...)
npx tsx scripts/check-comdirect.ts    # API-Mapping, Login-Ablauf (gemocktes fetch), Sicherungsformat
```

Beide müssen mit 0 FAIL durchlaufen; sie laufen vor jedem TestFlight-Build.

## Projektstruktur

| Pfad | Inhalt |
| --- | --- |
| `src/comdirect/` | API-Client mit Allow-List, Login-Ablauf (OAuth + photoTAN-Push), Mapping der API-Antworten, Schlüsselbund-Zugriff, Sync |
| `src/finance/` | Reine, getestete Rechenlogik: Performance (TWR/IRR), Sparplan-Erkennung, Sparziel, Entnahme, Zielaufteilung, ETF-Zusammensetzung, Überschneidungen, Vorabpauschale |
| `src/market/` | Kurs-Schätzungen zwischen den Bank-Abrufen (Yahoo, alle 15 Min.) und Branchen-Nachschlagen |
| `src/data/` | Lokale Ablage (AsyncStorage), Sicherungsformat (JSON, ohne Zugangsdaten), CSV-Import für ältere Umsätze und ETF-Bestandslisten |
| `src/ui/` | Theme (Gold-Akzent, hell/dunkel), AppLock (Face-ID-Sperre + Vorhang-Blickschutz), Privatsphäre-Modus (Weichzeichner), Haptik, Blätter und Karten |
| `src/screens/DashboardScreen.tsx` | Die eine Seite der App; verdrahtet alles, inkl. Spotlight-Tour |
| `scripts/` | Testskripte und Starthelfer |
| `TESTFLIGHT.md` | Build- und Veröffentlichungsprozess (EAS Build → App Store Connect) |

Konventionen: eine Datei pro Thema, Kommentare auf Deutsch erklären das Warum,
Rechenlogik bleibt frei von React/UI und wird in den Skripten getestet.

## Build & TestFlight

Siehe `TESTFLIGHT.md`. Kurzfassung: `npx eas-cli build --platform ios --profile production
--non-interactive --no-wait --auto-submit` baut in der Expo-Cloud und reicht automatisch bei
App Store Connect ein. `appVersionSource: remote` + `autoIncrement` verwalten die
Build-Nummern. TestFlight-Builds laufen nach 90 Tagen ab und werden dann neu gebaut.

## Was bewusst nicht im Repo liegt

- comdirect-Zugangsdaten (Client ID/Secret, Zugangsnummer, PIN): gibt der Nutzer auf dem
  iPhone ein, sie existieren nur in dessen Schlüsselbund.
- Apple-/Expo-Zugänge: Zertifikate und der App-Store-Connect-API-Key liegen bei EAS.
- Depot- und Nutzerdaten jeder Art.
