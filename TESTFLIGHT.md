# Depot Tracker über TestFlight aufs iPhone

Stand: 12.11.2026. Das Projekt ist vorbereitet (Icon, Splash, Bundle-ID `com.maxkdev.depottracker`, `eas.json`).

## Einmalig: Voraussetzungen

1. **Apple Developer Program** mit deiner Apple-ID beitreten: <https://developer.apple.com/programs/enroll/> (99 €/Jahr). Freischaltung dauert meist 1–2 Tage.
2. In der jetzigen App (Expo Go) einmal **„Zugang verwalten“ → „Sichern“** ausführen, damit die gesammelten Umsätze später in die neue App umziehen können.

## Build und Upload (im Projektordner, sobald der Account freigeschaltet ist)

```
npx eas-cli login
```
Expo-Konto `maxk-dev`.

```
npx eas-cli build --platform ios --profile production
```
Beim ersten Mal fragt EAS nach: EAS-Projekt anlegen (Ja), Apple-Konto verknüpfen (Ja, Apple-ID eingeben – EAS legt Zertifikate und Provisioning-Profil selbst an). Der Build läuft dann in der Expo-Cloud, ca. 10–20 Minuten.

```
npx eas-cli submit --platform ios --latest
```
Lädt den fertigen Build zu App Store Connect hoch. Beim ersten Mal wird der App-Eintrag angelegt.

## In App Store Connect (einmalig)

1. <https://appstoreconnect.apple.com> → Apps → Depot Tracker → **TestFlight**.
2. Warten, bis der Build „Verarbeitung abgeschlossen“ zeigt (einige Minuten bis Stunden).
3. Unter **Interne Tests** eine Gruppe anlegen und dich selbst als Tester hinzufügen (keine App-Review nötig).
4. Auf dem iPhone die **TestFlight-App** öffnen → Einladung annehmen → installieren.

## In der neuen App

1. comdirect-Zugang neu eingeben (Client ID, Secret, Zugangsnummer, PIN – der Schlüsselbund der Expo-Go-App ist getrennt).
2. **„Wiederherstellen“** mit der Sicherung aus iCloud Drive: holt alle gesammelten Umsätze und Einstellungen zurück.

## Laufend

- **TestFlight-Builds laufen nach 90 Tagen ab.** Rechtzeitig `build` + `submit` wiederholen (gleiche zwei Befehle).
- Neue App-Version: `version` in `app.json` erhöhen; die Build-Nummer zählt EAS automatisch hoch (`autoIncrement`).
