// Inhalte für „Anleitung & FAQ“. Reiner Text, damit er sich leicht pflegen lässt.
// Bei Änderungen an der App hier mitziehen.

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface GuideSection {
  icon: IconName;
  title: string;
  /** Absätze; Zeilen, die mit „• “ beginnen, werden als Aufzählung gezeigt */
  body: string[];
}

export interface FaqItem {
  question: string;
  answer: string[];
}

export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

export const GUIDE: GuideSection[] = [
  {
    icon: 'sparkles-outline',
    title: 'Was die App macht',
    body: [
      'Depot Tracker zeigt dein comdirect-Depot ruhig und auf einen Blick: wie viel es wert ist, wie gut dein Geld wirklich gearbeitet hat und ob du besser oder schlechter liegst als ein einfacher MSCI-World-ETF.',
      'Die App liest nur. Sie kann keine Aufträge erteilen und kein Geld bewegen.',
    ],
  },
  {
    icon: 'key-outline',
    title: 'Einrichtung',
    body: [
      '1. Schalte im comdirect-Onlinebanking den API-Zugang frei. Du bekommst eine Client ID und ein Client Secret.',
      '2. Tippe in der App ganz unten auf „comdirect verbinden“ bzw. „Zugang verwalten“.',
      '3. Gib Client ID, Client Secret, deine 8-stellige Zugangsnummer und deine 6-stellige PIN ein und tippe auf „Speichern“.',
      '4. Bestätige die Anmeldung in der photoTAN-App. Danach lädt die App Positionen und Umsätze.',
      'Alles wird nur im Schlüsselbund dieses iPhones gespeichert.',
    ],
  },
  {
    icon: 'refresh-outline',
    title: 'Aktualisieren',
    body: [
      'Der Pfeil oben rechts holt den aktuellen Stand von comdirect. Dafür ist jedes Mal eine Freigabe in der photoTAN-App nötig.',
      'Zwischendurch brauchst du keine TAN: Beim Öffnen und alle 15 Minuten holt die App aktuelle Kurse von Yahoo und bewertet deinen zuletzt bekannten Bestand damit. Das erkennst du am „≈“ vor dem Depotwert und an der Zeile „Geschätzt · Kurse …“ darunter.',
      'Nach Käufen, Sparplan-Ausführungen oder Verkäufen solltest du über comdirect aktualisieren, damit der Bestand wieder stimmt.',
    ],
  },
  {
    icon: 'home-outline',
    title: 'Die Startseite',
    body: [
      '• Große Zahl: der Wert deines Depots, darunter der Stand der Kurse.',
      '• Beim Öffnen nach mindestens einer Stunde Pause zeigt ein Banner oben kurz, wie sich dein Depot seit deinem letzten Besuch bewegt hat. Langes Drücken auf den Depotwert zeigt es jederzeit.',
      '• Darunter: Gewinn in Euro und die Rendite pro Jahr (p.a.) im gewählten Zeitraum. Sie berücksichtigt, wann du wie viel eingezahlt hast.',
      '• „seit Kauf“: genau die Zahl, die auch die comdirect-App zeigt (heutiger Wert minus Einstandswert).',
      '• Hinweise: z. B. ein Rücksetzer gegenüber dem Höchststand, Gebühren, Meilensteine oder ein zu großes Gewicht einzelner Aktien.',
      '• Sparen & Ziel: deine Sparrate und der Fortschritt zu deinem Wunschbetrag. Antippen zeigt Details, auch was du dieses Jahr eingezahlt hast.',
      '• Positionen: Aufteilung als Balken und jede Position mit Wert und Rendite. Antippen öffnet die Details. Über „Zielaufteilung“ legst du Wunschanteile fest.',
      '• Was steckt drin: die größten Länder und Branchen über alle deine ETFs. Antippen öffnet die Details und den Import der Bestandslisten.',
      '• Jahre: Gewinn und Rendite des laufenden Jahres, darunter die Vorjahre. Antippen öffnet die Jahresübersicht.',
    ],
  },
  {
    icon: 'analytics-outline',
    title: 'Der Chart',
    body: [
      '• Zeitraum: das laufende Jahr (die Jahreszahl), 1 J, 3 J oder Max. Ausgegraute Zeiträume reichen weiter zurück als deine Umsätze.',
      '• € zeigt Beträge: Depotwert (blau), MSCI World (orange) und eingesetztes Geld (grau gestrichelt).',
      '• % zeigt die reine Wertentwicklung: Käufe und Verkäufe verschieben die Linie nicht. So siehst du direkt, ob deine Auswahl oder der MSCI World besser lief.',
      '• Violett gestrichelt: Hier ist der Wert wegen eines Verkaufs gesunken, nicht wegen fallender Kurse.',
      '• Mit dem Finger über den Chart ziehen zeigt die Werte jeder Woche.',
      '• Unten in der Karte: wie viele Prozentpunkte pro Jahr du vor oder hinter dem MSCI World liegst. Antippen zeigt die Details.',
      '• Die App merkt sich, ob du zuletzt € oder % gewählt hast.',
    ],
  },
  {
    icon: 'pie-chart-outline',
    title: 'Positionen im Detail',
    body: [
      'Tippe auf eine Position, um Verlauf, Stückzahl, Kurs und Einstandswert zu sehen. „Gewinn seit Kauf (comdirect)“ entspricht der comdirect-App.',
      'Wenn importiert: erhaltene Ausschüttungen und die bisher bezahlte Steuer auf die Vorabpauschale.',
    ],
  },
  {
    icon: 'options-outline',
    title: 'Zielaufteilung',
    body: [
      'Tippe in der Karte „Positionen“ oben rechts auf „Zielaufteilung“ und trage für jede Position den gewünschten Anteil in Prozent ein. Zusammen müssen es genau 100 % sein. „Heutige Aufteilung eintragen“ füllt die Felder als Ausgangspunkt.',
      'Danach steht bei jeder Position „Ziel … %“. Weicht eine Position um mehr als 5 Prozentpunkte ab, wird das orange hervorgehoben und es erscheint ein Hinweis auf der Startseite.',
      'Die App beobachtet nur. Ob und wie du eine Abweichung ausgleichst, entscheidest du. Die Zielaufteilung ist in der Sicherungsdatei enthalten.',
    ],
  },
  {
    icon: 'flag-outline',
    title: 'Sparen & Ziel',
    body: [
      'Die App erkennt deine Sparpläne selbst: Ein Wertpapier zählt, wenn du es in mindestens drei der letzten vier Monate für einen ähnlichen Betrag gekauft hast. Einzelne große Käufe zählen nicht zur Sparrate.',
      'Neuer Sparplan? Öffne die Position und schalte „Sparplan“ ein. Dann zählt er sofort mit der Höhe des letzten Kaufs. Die App prüft weiter mit: Wird im laufenden und im letzten Monat nicht gekauft, zählt er nicht mehr zur Sparrate und ist als inaktiv gekennzeichnet.',
      '„Dieses Jahr eingezahlt“ sind alle Käufe des laufenden Jahres zusammen, auch Einzelkäufe.',
      'Tippe auf die Karte, um einen Wunschbetrag für dein Depot festzulegen. Danach zeigt ein Balken, wie weit du bist, und die App schätzt, wann du das Ziel erreichst:',
      '• mit einer angenommenen Rendite im Jahr, die du im selben Blatt mit − und + einstellst (Vorgabe 5 %), und',
      '• ganz ohne Kursgewinne, nur durch deine Sparrate.',
      'Unter „Entnahme“ rechnest du die andere Richtung: Du gibst eine Wunsch-Entnahme pro Monat ein, und die App zeigt, wie groß das Depot dafür sein müsste – einmal bei Kapitalerhalt (die Entnahme kommt allein aus der Rendite, das Depot bleibt) und einmal beim Verzehr über eine wählbare Zahl von Jahren (danach ist es aufgebraucht). Dazu siehst du, was dein heutiges Depot bei Kapitalerhalt tragen würde. Mit einem Tipp übernimmst du das Kapitalerhalt-Depot als Wunschbetrag, und die Hochrechnung schätzt, wann du es erreichst. Alles ist eine grobe Modellrechnung ohne Steuern und Inflation, keine Empfehlung.',
      'Ziel, Rendite, Sparplan-Markierungen, Zielaufteilung und Wunsch-Entnahme bleiben gespeichert, auch wenn du den comdirect-Zugang löschst, und sind in der Sicherungsdatei enthalten. Du kannst das Ziel jederzeit ändern oder entfernen.',
    ],
  },
  {
    icon: 'globe-outline',
    title: 'Was steckt drin',
    body: [
      'Ein ETF enthält oft über tausend Firmen. Diese Ansicht rechnet über alle deine ETFs zusammen, in welchen Ländern, Branchen und Firmen dein Geld tatsächlich steckt. Steckt Apple in zwei ETFs, werden beide Anteile addiert.',
      'Dafür braucht die App von jedem ETF die Bestandsliste des Anbieters:',
      '1. Suche in Safari nach der ISIN oder WKN deines ETF und öffne die Seite beim Anbieter, zum Beispiel ishares.com. Beide Nummern stehen in „Was steckt drin“ bei jedem ETF und in den Details der Position. Antippen kopiert die jeweilige Nummer.',
      '2. Lade dort unter „Positionen“ bzw. „Bestände“ die vollständige Liste als CSV herunter.',
      '3. Wenn du alle Listen hast: Tippe in der App auf „Was steckt drin“ und dann auf „Alle Listen auf einmal importieren“. Wähle alle Dateien zusammen aus.',
      'Du musst nicht wissen, welche Datei zu welchem ETF gehört. Die App vergleicht den Inhalt jeder Liste (Länder, Branchen, Anzahl der Firmen) mit dem Namen deiner ETFs und schlägt die Zuordnung vor. Du siehst sie vor dem Übernehmen und kannst sie mit „Ändern“ korrigieren.',
      'Du kannst auch einzeln importieren: beim ETF auf „Importieren“ tippen. Passt die Liste erkennbar zu einem anderen ETF, fragt die App nach.',
      'Geprüft ist das Format von iShares. Listen anderer Anbieter funktionieren, wenn sie als CSV mit Name, Gewichtung und Land oder Branche vorliegen. Excel-Dateien kann die App nicht lesen.',
      'Einzelaktien zählen als eigene Firma. Kommt dieselbe Firma in einem deiner ETFs vor, übernimmt die App Land und Branche von dort.',
      '„Überschneidungen zwischen deinen ETFs“ zeigt für jedes Paar, welcher Teil in denselben Firmen steckt. Ab 50 % gilt die Überschneidung als hoch und erscheint auch auf der Startseite. Darunter steht eine allgemeine Einordnung, was das bedeutet.',
      '„Womit die größten Firmen ihr Geld verdienen“ geht einen Schritt weiter: Für die 25 größten Firmen schlägt die App bei Yahoo den genauen Geschäftsbereich nach, etwa „Halbleiter (Chips)“, „Online-Handel“ oder „Maschinenbau“, und erklärt ihn in einem Satz. Das Nachschlagen dauert beim ersten Mal einen Moment.',
    ],
  },
  {
    icon: 'calendar-outline',
    title: 'Jahresübersicht',
    body: [
      'Ein Tipp auf „Jahre“ zeigt oben deinen Gewinn seit Beginn und woraus er besteht:',
      '• Buchgewinn: der Gewinn auf Anteile, die noch im Depot liegen.',
      '• Realisiert: der Gewinn, den du mit Verkäufen tatsächlich mitgenommen hast (Erlös minus Einstand, vor Steuern).',
      '• Ausschüttungen: was dir netto gutgeschrieben wurde.',
      'Darunter steht jedes Kalenderjahr einzeln: Rendite, Vergleich mit dem MSCI World, Gewinn, Käufe, Verkäufe, Ausschüttungen und der Wert am Jahresende. Das laufende Jahr ist mit „bisher“ gekennzeichnet.',
      'Hast du aus einer Position schon verkauft, steht der realisierte Gewinn auch in ihren Details.',
      'Beim laufenden Jahr steht außerdem eine Vorschau auf die Vorabpauschale: die Steuer, die comdirect Anfang Januar für thesaurierende ETFs abbucht. Im Dezember und Januar erinnert auch ein Hinweis auf der Startseite daran, damit das Verrechnungskonto gedeckt ist.',
    ],
  },
  {
    icon: 'document-text-outline',
    title: 'Ältere Umsätze und Ausschüttungen importieren',
    body: [
      'comdirect liefert über die Schnittstelle nur etwa ein halbes Jahr. Ältere Daten holst du dir per CSV-Export von comdirect.de:',
      '• Depot → Depotumsätze: Käufe und Verkäufe (bis zu 2 Jahre).',
      '• Umsätze des Verrechnungskontos: Ausschüttungen, Dividenden und die Vorabpauschale.',
      'Jeweils den Zeitraum so weit wie möglich zurückstellen, „Export als csv“ wählen und in der App unter „Zugang verwalten“ → „Umsätze importieren“ auswählen. Die App erkennt die Art der Datei selbst, zeigt vor dem Übernehmen eine Zusammenfassung und zählt nichts doppelt.',
    ],
  },
  {
    icon: 'cloud-upload-outline',
    title: 'Daten sichern',
    body: [
      'Die App sammelt mit jedem Abruf und Import Umsätze, die comdirect später nicht mehr liefert. Damit sie ein Löschen der App überstehen:',
      '„Zugang verwalten“ → „Sichern“ → „In Dateien sichern“ → iCloud Drive.',
      '„Wiederherstellen“ führt eine Sicherung mit dem aktuellen Stand zusammen und überschreibt nichts. Die Datei enthält deine Depotdaten, Ziel, angenommene Rendite, Sparplan-Markierungen, Zielaufteilung und die importierten ETF-Listen, aber keine Zugangsdaten.',
      'Einstellungen, die auf dem iPhone schon gesetzt sind, bleiben beim Wiederherstellen erhalten. Die Sicherung ergänzt nur, was fehlt.',
      'Ist die letzte Sicherung älter als vier Wochen, erinnert dich die App nach einem Abruf daran.',
    ],
  },
  {
    icon: 'eye-off-outline',
    title: 'Privatsphäre-Modus',
    body: [
      'Das Auge oben rechts verwischt alle Beträge und Stückzahlen und ersetzt sie durch einen gleich langen Platzhalter. So verrät nicht einmal die Länge, wie groß eine Zahl ist. Prozentwerte bleiben sichtbar. Die App merkt sich die Einstellung.',
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'Sicherheit',
    body: [
      '• Zugangsdaten liegen nur im iOS-Schlüsselbund dieses iPhones, die PIN ist zusätzlich geschützt.',
      '• App-Sperre: Unter „Zugang verwalten“ → „Schutz“ kannst du die ganze App mit Face ID bzw. dem Geräte-Code sperren.',
      '• Nur lesen: Jeder Aufruf an comdirect wird vor dem Absenden gegen eine feste Liste geprüft. Order-, Überweisungs- und Kontoaufrufe sind gesperrt und verlassen das iPhone nie.',
      '• Nach jedem Abruf macht die App die Anmeldung bei comdirect sofort wieder ungültig.',
      '• Schutz vor Sperre: comdirect sperrt nach 5 TAN-Anfragen ohne Freigabe. Die App zählt mit, warnt früh und blockiert vor der fünften.',
      '• Yahoo sieht nur, welche Wertpapiere (ISINs) abgefragt werden, keine Stückzahlen oder Beträge.',
    ],
  },
];

export const FAQ: FaqGroup[] = [
  {
    title: 'Zahlen verstehen',
    items: [
      {
        question: 'Warum unterscheidet sich die Rendite p.a. von „seit Kauf“?',
        answer: [
          '„seit Kauf“ rechnet wie comdirect: heutiger Wert der Anteile, die du noch hast, gegenüber ihrem Einstandswert. Wann du gekauft hast und was du verkauft hast, spielt keine Rolle.',
          'Die Rendite p.a. der App berücksichtigt jede Ein- und Auszahlung mit ihrem Datum, auch Verkäufe und Ausschüttungen, und rechnet auf ein Jahr hoch. Bei Sparplänen und Teilverkäufen weichen die beiden Zahlen deshalb oft deutlich ab. Beide sind richtig, sie beantworten nur verschiedene Fragen.',
        ],
      },
      {
        question: 'Was ist der Unterschied zwischen der €- und der %-Ansicht?',
        answer: [
          '€ zeigt, wie viel Geld im Depot steckt. Käufe lassen die Linie steigen, Verkäufe fallen.',
          '% zeigt die zeitgewichtete Rendite: nur die Kursentwicklung, unabhängig davon, wann du wie viel eingezahlt hast. So vergleichen auch Fonds ihre Wertentwicklung. Ideal, um deine Auswahl mit dem MSCI World zu vergleichen.',
        ],
      },
      {
        question: 'Wie wird der Vergleich mit dem MSCI World berechnet?',
        answer: [
          'Die App spielt ein Schattendepot durch: Es startet mit demselben Wert wie dein Depot und bekommt genau dieselben Ein- und Auszahlungen am selben Tag. Nur fließt jeder Euro in einen thesaurierenden MSCI-World-ETF (iShares Core, Xetra). So zählt allein, welche Wertpapiere du gewählt hast.',
        ],
      },
      {
        question: 'Wo sehe ich genauer als „IT“ oder „Industrie“, worin ich investiert bin?',
        answer: [
          'Die Bestandslisten der Anbieter ordnen jede Firma nur einer von elf groben Branchen zu. Genauer ist der Abschnitt „Womit die größten Firmen ihr Geld verdienen“ in „Was steckt drin“: Dort steht für die 25 größten Firmen der Geschäftsbereich mit einer kurzen Erklärung, zum Beispiel „Halbleiter (Chips)“ für NVIDIA oder „Maschinenbau“.',
          'Zwei Grenzen: Die vielen kleineren Firmen sind dort nicht enthalten, die Prozentzahlen decken also nur einen Teil deines Depots ab. Und ein eigenes Etikett „KI“ gibt es in den Daten nicht. Am nächsten kommen Halbleiter, Software und Internet-Plattformen.',
          'Yahoo sieht beim Nachschlagen nur die Namen dieser Firmen, keine Stückzahlen oder Beträge.',
        ],
      },
      {
        question: 'Wie wird die Überschneidung zweier ETFs berechnet?',
        answer: [
          'Für jede Firma, die in beiden ETFs steckt, zählt der kleinere der beiden Anteile. Hat Apple im einen ETF 5 % und im anderen 7 %, sind 5 % gemeinsam. Die Summe über alle Firmen ist die Überschneidung. 100 % wären zwei gleiche ETFs.',
          'Steht „mind.“ vor der Zahl, ist die gespeicherte Liste eines ETF nicht vollständig, und die echte Überschneidung kann höher liegen. Ein neuer Import der Liste behebt das.',
        ],
      },
      {
        question: 'Ist eine hohe Überschneidung schlecht?',
        answer: [
          'Nicht unbedingt. Sie bedeutet, dass zwei ETFs sich ähnlich entwickeln und du in den gemeinsamen Firmen stärker gewichtet bist. Ob das stört, hängt davon ab, was du mit dem zweiten ETF erreichen wolltest.',
          'Wer breiter streuen möchte, kombiniert üblicherweise ETFs, die sich ergänzen. Ohne Verkauf lässt sich das Gewicht über die künftigen Sparraten verschieben, ein Verkauf kann Steuern und Gebühren auslösen.',
          'Die App beobachtet nur und gibt keine Anlageberatung. Sie kennt weder deine Ziele noch deine Steuersituation.',
        ],
      },
      {
        question: 'Merkt die App, wenn ich die falsche Liste importiere?',
        answer: [
          'Meistens ja. Die Dateien der Anbieter nennen ihren ETF nicht, deshalb prüft die App den Inhalt: Ein „Emerging Markets“-ETF sollte vor allem China, Taiwan und Indien enthalten, ein „S&P 500“ rund 500 Firmen aus den USA. Passt eine Liste nicht zum Namen, fragt die App nach oder zeigt einen orangen Hinweis.',
          'Die Grenze: Zwei sehr ähnliche ETFs, etwa zwei auf denselben Index, kann die App nicht unterscheiden. Das Ergebnis wäre dann aber auch fast gleich. Bei ETFs mit einem Namen, der nichts über den Inhalt verrät, kann sie nicht prüfen.',
          'Unter jedem ETF steht zur Kontrolle eine Kurzbeschreibung der Liste, zum Beispiel „1.215 Positionen · Vereinigte Staaten 72 %, Japan 6 % · größte: Apple“.',
        ],
      },
      {
        question: 'Warum sind nicht 100 % meines Depots ausgewertet?',
        answer: [
          'Ausgewertet wird nur, wofür eine Bestandsliste vorliegt. ETFs ohne Import und Einzelaktien, die in keinem deiner ETFs vorkommen, stehen als „Nicht ausgewertet“ da.',
          'Die Listen holt die App nicht selbst ab. Sie ändern sich langsam, ein neuer Import alle paar Monate reicht.',
        ],
      },
      {
        question: 'Was bedeutet „über“ oder „unter“ dem Wunschanteil?',
        answer: [
          'Die App vergleicht den heutigen Anteil einer Position am Depot mit dem Anteil, den du in der Zielaufteilung festgelegt hast. Soll ein ETF 70 % ausmachen und liegt bei 77 %, ist er 7 Prozentpunkte über Ziel.',
          'Abweichungen entstehen von selbst, weil sich Kurse unterschiedlich entwickeln. Ein Hinweis kommt erst ab mehr als 5 Prozentpunkten. Eine neue Position hat keinen Wunschanteil, bis du die Zielaufteilung anpasst.',
        ],
      },
      {
        question: 'Warum zeigt die App keine oder eine andere Sparrate?',
        answer: [
          'Die App sieht nur ausgeführte Käufe, nicht den eingerichteten Sparplan bei comdirect. Sie braucht mindestens drei ähnlich hohe Käufe desselben Wertpapiers in den letzten vier Monaten. Ein neuer Sparplan taucht deshalb erst nach der dritten Ausführung von selbst auf, ein beendeter verschwindet nach zwei Monaten ohne Kauf.',
          'Schneller geht es von Hand: Sobald der erste Kauf im Depot ist, kannst du die Position öffnen und „Sparplan“ einschalten.',
          'Die Rate enthält die Kaufgebühren. Wird ein Sparplan nur alle drei Monate ausgeführt, erkennt ihn die App nicht.',
        ],
      },
      {
        question: 'Wie verlässlich ist die Hochrechnung zum Ziel?',
        answer: [
          'Sie ist eine grobe Orientierung. Die App rechnet mit deinem heutigen Depotwert, deiner Sparrate und der Rendite, die du im Blatt „Sparen & Ziel“ einstellst (Vorgabe 5 % im Jahr). Sie wird nicht aus deinem bisherigen Erfolg abgeleitet, weil ein paar gute Jahre das Bild zu rosig machen würden. In guten Jahren geht es schneller, in schlechten langsamer. Die Zeile „Ohne Kursgewinne“ zeigt, wann du allein durch Einzahlungen ankommst.',
        ],
      },
      {
        question: 'Wie wird der realisierte Gewinn berechnet?',
        answer: [
          'Für jeden Verkauf: Erlös minus das, was die verkauften Anteile beim Kauf gekostet haben. Verkauft werden dabei rechnerisch immer die ältesten Anteile zuerst („zuerst gekauft, zuerst verkauft“). So rechnet auch das Finanzamt.',
          'Die Zahl ist vor Steuern. Fehlen der App die Käufe zu einem Verkauf, weil die Umsätze nicht weit genug zurückreichen, zählt dieser Teil ohne Gewinn und ohne Verlust. Mit dem CSV-Import der Depotumsätze wird die Zahl genauer.',
        ],
      },
      {
        question: 'Was ist der Unterschied zwischen Rendite und Gewinn in der Jahresübersicht?',
        answer: [
          'Der Gewinn ist der Wertzuwachs des Jahres in Euro: Wert am Jahresende minus Wert am Jahresanfang minus das, was du netto eingezahlt hast. Ausschüttungen zählen mit.',
          'Die Rendite zeigt die reine Kursentwicklung in Prozent, unabhängig davon, wann du gekauft oder verkauft hast. Deshalb lässt sie sich direkt mit dem MSCI World vergleichen.',
        ],
      },
      {
        question: 'Warum sind „1 J“ oder „3 J“ ausgegraut?',
        answer: [
          'Die App kennt deine Umsätze nur so weit zurück, wie comdirect sie liefert bzw. wie du sie importiert hast. Reicht ein Zeitraum weiter zurück, wäre er nicht aussagekräftig. Mit dem CSV-Import der Depotumsätze werden längere Zeiträume möglich.',
        ],
      },
      {
        question: 'Was bedeutet das „≈“ vor dem Depotwert?',
        answer: [
          'Die Zahl ist geschätzt: Dein zuletzt von comdirect abgerufener Bestand wird mit aktuellen Kursen von Yahoo bewertet. Käufe oder Verkäufe seit dem letzten Abruf fehlen darin. Nach einer Aktualisierung über comdirect verschwindet das „≈“.',
        ],
      },
      {
        question: 'Wie wird „seit deinem letzten Besuch“ berechnet?',
        answer: [
          'Beim Verlassen merkt sich die App deine Anteile und ihre Kurse. Beim nächsten Besuch vergleicht sie dieselben Anteile mit den neuen Kursen. Sparpläne, Käufe und Verkäufe dazwischen zählen nicht, sonst sähe eine Einzahlung wie Gewinn aus.',
          'Ein neuer Besuch beginnt, wenn die App mindestens eine Stunde im Hintergrund war. Mit „≈“ ist die Zahl mit Yahoo-Kursen geschätzt. Gibt es keine neuen Kurse, etwa abends oder am Wochenende, erscheint nichts. Ein langer Druck auf den Depotwert zeigt das Banner jederzeit.',
        ],
      },
      {
        question: 'Warum fällt die Linie, obwohl die Kurse nicht gefallen sind?',
        answer: [
          'Wahrscheinlich hast du verkauft. Verkäufe sind im Chart violett gestrichelt markiert. Mit dem Finger auf dem Punkt siehst du den Erlös. In der %-Ansicht verschieben Verkäufe die Linie nicht.',
        ],
      },
      {
        question: 'Warum ist eine Zahl im Chart blau mit gepunkteter Linie?',
        answer: ['Das ist der Höchst- bzw. Tiefstwert der Depotlinie. Wenn direkt am Punkt kein Platz ist, steht die Zahl etwas weiter weg und eine feine Linie zeigt, zu welchem Punkt sie gehört.'],
      },
    ],
  },
  {
    title: 'Ausschüttungen und Steuern',
    items: [
      {
        question: 'Warum fehlen meine Ausschüttungen?',
        answer: [
          'comdirect bucht Ausschüttungen und Dividenden auf das Verrechnungskonto, nicht ins Depot. Importiere deshalb den CSV-Export der Kontoumsätze. Bei thesaurierenden ETFs („Acc“) gibt es keine Ausschüttungen, die Erträge stecken im Kurs.',
        ],
      },
      {
        question: 'Sind Ausschüttungen vor oder nach Steuern?',
        answer: ['Nach Steuern, so wie das Geld bei dir ankommt.'],
      },
      {
        question: 'Was ist die Vorabpauschale und wie schätzt die App sie?',
        answer: [
          'Thesaurierende ETFs schütten nichts aus, trotzdem besteuert Deutschland jedes Jahr einen kleinen fiktiven Ertrag: die Vorabpauschale. comdirect bucht die Steuer darauf Anfang Januar vom Verrechnungskonto ab.',
          'Die App rechnet die amtliche Formel nach: 70 % des Basiszinses mal Wert deiner Anteile am Jahresanfang, höchstens aber der tatsächliche Wertzuwachs des Jahres, abzüglich Ausschüttungen. Bei im Jahr gekauften Anteilen zählt jeder volle Monat vor dem Kauf ein Zwölftel weniger. Auf das Ergebnis rechnet sie 30 % Teilfreistellung (Aktien-ETF) und 26,375 % Steuer.',
          'Den Basiszins legt das Bundesfinanzministerium jedes Jahr fest (2026: 3,20 %, 2025: 2,53 %, 2024: 2,29 %). Für künftige Jahre kennt die App ihn noch nicht und zeigt dann keine Vorschau.',
        ],
      },
      {
        question: 'Warum weicht die Januar-Abbuchung von der Vorschau ab?',
        answer: [
          'Die Vorschau ist eine Schätzung. Reicht dein Freistellungsauftrag bei comdirect noch, bucht die Bank gar nichts ab. Kirchensteuer kommt gegebenenfalls dazu. Außerdem rechnet die App mit Wochenkursen statt der exakten Rücknahmepreise, mit Netto- statt Brutto-Ausschüttungen, und solange das Jahr läuft, mit dem heutigen Kurs statt des Jahresendkurses.',
          'Die tatsächlich bezahlte Vorabpauschale siehst du nach dem Import der Januar-Kontoumsätze in den Details der Position. Sie ist keine zusätzliche Steuer: Beim Verkauf wird sie angerechnet.',
        ],
      },
      {
        question: 'Warum zählt die Vorabpauschale nicht in die Rendite?',
        answer: [
          'Sie ist eine Steuervorauszahlung auf thesaurierende Fonds. Beim Verkauf wird sie angerechnet, du zahlst dann entsprechend weniger Steuer. Als Kosten gezählt wäre deine Rendite dauerhaft zu niedrig und der Vergleich mit dem MSCI World schief. Die App zeigt die bezahlte Summe deshalb nur zur Info im Positionsblatt.',
        ],
      },
      {
        question: 'Warum sind die Gebühren bei echten Daten 0 €?',
        answer: [
          'Die comdirect-Schnittstelle liefert Gebühren nicht einzeln. Sie stecken aber im Einstandswert und damit in „seit Kauf“.',
        ],
      },
    ],
  },
  {
    title: 'Daten und Sicherheit',
    items: [
      {
        question: 'Kann die App Aufträge erteilen oder Geld überweisen?',
        answer: [
          'Nein. Jeder Aufruf an comdirect wird vor dem Absenden gegen eine feste Liste geprüft. Erlaubt sind nur die Anmeldung, das Lesen von Depots, Positionen und Depotumsätzen sowie das Abmelden. Alles andere wird blockiert, bevor eine Verbindung entsteht. Für eine Order wäre außerdem immer eine eigene TAN-Freigabe nötig.',
        ],
      },
      {
        question: 'Wo liegen meine Daten?',
        answer: [
          'Nur auf deinem iPhone: Zugangsdaten im iOS-Schlüsselbund, Depotdaten im Speicher der App. Es gibt keinen Server der App. Yahoo erfährt nur, welche ISINs abgefragt werden.',
        ],
      },
      {
        question: 'Was passiert, wenn ich die App lösche?',
        answer: [
          'Alle Daten auf dem iPhone sind dann weg, auch die gesammelten älteren Umsätze. Mit einer Sicherung in iCloud Drive und „Wiederherstellen“ holst du sie zurück. Zugangsdaten musst du neu eingeben.',
        ],
      },
      {
        question: 'Warum fragt die App nach meinem iPhone-Code statt Face ID?',
        answer: [
          'In Expo Go kann die App Face ID nicht direkt nutzen und fällt auf den Code zurück. Mit einer eigenen App-Version (Apple-Entwicklerzugang) funktioniert echtes Face ID.',
        ],
      },
      {
        question: 'Warum warnt die App vor zu vielen TAN-Anfragen?',
        answer: [
          'comdirect sperrt den Zugang nach 5 TAN-Anfragen ohne Freigabe oder 3 falschen TANs. Die App fordert nie automatisch eine neue TAN an, zählt offene Anfragen mit und blockiert vor der fünften. Eine erfolgreiche Anmeldung in der App setzt ihren Zähler zurück.',
        ],
      },
    ],
  },
  {
    title: 'Probleme',
    items: [
      {
        question: 'Die App lädt nicht oder zeigt einen Fehler beim Start.',
        answer: [
          'Die App läuft über Expo Go und wird vom PC geladen. Der PC muss an sein, der Server muss laufen, und das iPhone muss im selben WLAN sein. Danach die App in Expo Go schließen und neu öffnen.',
        ],
      },
      {
        question: 'Für ein Wertpapier gibt es keinen Verlauf von Yahoo.',
        answer: [
          'Die App sucht jedes Papier per ISIN. Findet Yahoo es nicht oder weicht der Kurs um mehr als 15 % vom comdirect-Kurs ab (vermutlich ein anderes Papier), nutzt die App nur die comdirect-Kurse. Der Wert stimmt trotzdem, nur der Verlauf ist gröber.',
        ],
      },
      {
        question: 'Der Import meldet „nicht lesbar“ oder „nicht zuordenbar“.',
        answer: [
          'Prüfe, ob es der richtige Export ist (Depotumsätze bzw. Kontoumsätze von comdirect.de). Ausschüttungen ordnet die App über die WKN im Buchungstext zu. Fehlt sie, wird die Buchung übersprungen. Übersprungene Zeilen nennt die Zusammenfassung vor dem Übernehmen.',
        ],
      },
      {
        question: 'Wie gehe ich sicher, dass alles stimmt?',
        answer: [
          'Vergleiche „seit Kauf, wie bei comdirect“ und den Einstandswert im Positionsblatt mit der comdirect-App. Diese Zahlen kommen direkt von comdirect und sollten genau übereinstimmen.',
        ],
      },
    ],
  },
];
