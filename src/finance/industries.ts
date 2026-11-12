// Geschäftsbereiche verständlich machen: deutscher Name und ein Satz, was Firmen dieses Bereichs tun.
// Die englischen Schlüssel sind Yahoos Bezeichnungen. Unbekannte Bereiche werden unverändert gezeigt.

import type { CompanySlice } from './composition';

export interface IndustryInfo {
  label: string;
  /** Ein Satz für Laien; leer, wenn es keinen gibt */
  explain: string;
}

const INFO: Record<string, [string, string]> = {
  // Technologie
  semiconductors: ['Halbleiter (Chips)', 'Entwickeln und bauen Computerchips, unter anderem für Rechenzentren, KI, Handys und Autos.'],
  'semiconductor equipment & materials': ['Maschinen für die Chipfertigung', 'Liefern die Anlagen und Materialien, mit denen Chiphersteller produzieren.'],
  'software - infrastructure': ['Software: Betriebssysteme & Cloud', 'Grundlegende Software wie Betriebssysteme, Datenbanken, Cloud-Dienste und IT-Sicherheit.'],
  'software - application': ['Software: Anwendungen', 'Programme für Unternehmen und Privatleute, etwa für Buchhaltung, Vertrieb oder Gestaltung.'],
  'consumer electronics': ['Unterhaltungselektronik', 'Geräte für Endkunden wie Smartphones, Computer und Kopfhörer.'],
  'information technology services': ['IT-Dienstleistungen', 'Beraten Unternehmen bei IT-Projekten und betreiben deren Systeme.'],
  'communication equipment': ['Netzwerktechnik', 'Geräte für Datennetze und Mobilfunk, etwa Router und Funkmasten.'],
  'computer hardware': ['Computer & Speicher', 'Bauen Rechner, Server und Speichersysteme.'],
  'electronic components': ['Elektronische Bauteile', 'Bauteile wie Stecker, Sensoren und Leiterplatten, die in anderen Geräten stecken.'],
  'scientific & technical instruments': ['Mess- und Prüftechnik', 'Präzisionsgeräte zum Messen und Prüfen für Industrie und Forschung.'],
  solar: ['Solartechnik', 'Solarmodule, Wechselrichter und Zubehör.'],
  // Kommunikation
  'internet content & information': ['Internet-Plattformen', 'Suchmaschinen, soziale Netzwerke und Online-Werbung.'],
  entertainment: ['Unterhaltung & Streaming', 'Filme, Serien, Musik und Streaming-Dienste.'],
  'telecom services': ['Telekommunikation', 'Mobilfunk-, Festnetz- und Internetanbieter.'],
  'electronic gaming & multimedia': ['Videospiele', 'Entwickeln und vertreiben Computerspiele.'],
  'advertising agencies': ['Werbung', 'Planen und schalten Werbung für andere Unternehmen.'],
  // Konsum
  'internet retail': ['Online-Handel', 'Verkaufen Waren über das Internet und betreiben Marktplätze.'],
  'auto manufacturers': ['Autohersteller', 'Entwickeln und bauen Autos, auch Elektroautos.'],
  'auto parts': ['Autozulieferer', 'Liefern Teile und Technik an Autohersteller.'],
  restaurants: ['Restaurants & Fast Food', 'Betreiben Restaurantketten.'],
  'home improvement retail': ['Baumärkte', 'Verkaufen Material und Werkzeug für Haus und Garten.'],
  'luxury goods': ['Luxusgüter', 'Mode, Schmuck und Uhren im oberen Preissegment.'],
  'apparel retail': ['Modehandel', 'Verkaufen Kleidung in Läden und online.'],
  'footwear & accessories': ['Schuhe & Sportartikel', 'Entwerfen und verkaufen Schuhe und Sportbekleidung.'],
  'travel services': ['Reisen', 'Vermitteln Flüge, Hotels und Unterkünfte.'],
  lodging: ['Hotels', 'Betreiben Hotelketten.'],
  'discount stores': ['Discounter & Großmärkte', 'Verkaufen Lebensmittel und Alltagswaren zu niedrigen Preisen.'],
  'grocery stores': ['Supermärkte', 'Verkaufen Lebensmittel.'],
  'packaged foods': ['Lebensmittel', 'Stellen verpackte Lebensmittel her.'],
  'beverages - non-alcoholic': ['Getränke', 'Stellen alkoholfreie Getränke her.'],
  'beverages - wineries & distilleries': ['Spirituosen & Wein', 'Stellen Spirituosen und Wein her.'],
  'beverages - brewers': ['Brauereien', 'Brauen und verkaufen Bier.'],
  'household & personal products': ['Haushalt & Körperpflege', 'Alltagsprodukte wie Waschmittel, Kosmetik und Hygieneartikel.'],
  tobacco: ['Tabak', 'Stellen Zigaretten und andere Tabakprodukte her.'],
  confectioners: ['Süßwaren', 'Stellen Schokolade und Süßigkeiten her.'],
  // Gesundheit
  'drug manufacturers - general': ['Pharma', 'Entwickeln und verkaufen Medikamente.'],
  'drug manufacturers - specialty & generic': ['Pharma: Spezial- & Nachahmerpräparate', 'Stellen Spezialmedikamente und günstige Nachahmerpräparate her.'],
  biotechnology: ['Biotechnologie', 'Entwickeln neue Wirkstoffe mit biologischen Verfahren.'],
  'medical devices': ['Medizintechnik', 'Geräte wie Herzschrittmacher, Implantate und Operationsroboter.'],
  'medical instruments & supplies': ['Medizinische Instrumente', 'Instrumente und Verbrauchsmaterial für Kliniken und Praxen.'],
  'healthcare plans': ['Krankenversicherer', 'Bieten Krankenversicherungen an, vor allem in den USA.'],
  'diagnostics & research': ['Labor & Diagnostik', 'Laborgeräte, Tests und Dienstleistungen für die Forschung.'],
  'medical distribution': ['Pharma-Großhandel', 'Beliefern Apotheken und Kliniken.'],
  // Finanzen
  'banks - diversified': ['Großbanken', 'Weltweit tätige Banken mit Privat-, Firmen- und Investmentgeschäft.'],
  'banks - regional': ['Regionalbanken', 'Banken mit Schwerpunkt in einem Land oder einer Region.'],
  'credit services': ['Zahlungsverkehr & Kreditkarten', 'Wickeln Kartenzahlungen ab und vergeben Kredite.'],
  'asset management': ['Vermögensverwaltung', 'Verwalten Geld für Anleger, etwa in Fonds.'],
  'capital markets': ['Investmentbanken & Broker', 'Begleiten Börsengänge und handeln Wertpapiere.'],
  'insurance - diversified': ['Versicherungen', 'Bieten Versicherungen verschiedener Art an.'],
  'insurance - life': ['Lebensversicherungen', 'Bieten Lebens- und Rentenversicherungen an.'],
  'insurance - property & casualty': ['Sachversicherungen', 'Versichern Autos, Häuser und Betriebe.'],
  'insurance - reinsurance': ['Rückversicherungen', 'Versichern andere Versicherer.'],
  'insurance brokers': ['Versicherungsmakler', 'Vermitteln Versicherungen.'],
  'financial data & stock exchanges': ['Börsen & Finanzdaten', 'Betreiben Börsen und liefern Kurs- und Bewertungsdaten.'],
  'financial conglomerates': ['Finanzkonzerne', 'Vereinen mehrere Finanzgeschäfte unter einem Dach.'],
  // Industrie
  'specialty industrial machinery': ['Maschinenbau', 'Bauen Maschinen und Anlagen für die Industrie.'],
  'farm & heavy construction machinery': ['Bau- & Landmaschinen', 'Bagger, Traktoren und andere schwere Maschinen.'],
  'aerospace & defense': ['Luftfahrt & Rüstung', 'Flugzeuge, Triebwerke und Verteidigungstechnik.'],
  'electrical equipment & parts': ['Elektrotechnik', 'Technik für Stromnetze, Antriebe und Automatisierung.'],
  conglomerates: ['Mischkonzerne', 'Unternehmen mit vielen verschiedenen Geschäftsbereichen.'],
  railroads: ['Eisenbahnen', 'Betreiben Schienennetze und Güterzüge.'],
  'integrated freight & logistics': ['Logistik', 'Transportieren Pakete und Fracht weltweit.'],
  airlines: ['Fluggesellschaften', 'Befördern Passagiere und Fracht per Flugzeug.'],
  'building products & equipment': ['Bauprodukte', 'Material und Technik für Gebäude, etwa Klimaanlagen.'],
  'engineering & construction': ['Bau & Anlagenbau', 'Planen und bauen große Bauwerke und Anlagen.'],
  'industrial distribution': ['Industriehandel', 'Beliefern Betriebe mit Werkzeug und Ersatzteilen.'],
  'waste management': ['Entsorgung', 'Sammeln und verwerten Abfall.'],
  'specialty business services': ['Dienstleistungen für Unternehmen', 'Übernehmen Aufgaben wie Abrechnung oder Prüfungen für andere Firmen.'],
  'consulting services': ['Beratung', 'Beraten Unternehmen und prüfen Daten.'],
  'staffing & employment services': ['Personaldienstleister', 'Vermitteln Arbeitskräfte.'],
  'trading companies & distributors': ['Handelshäuser', 'Handeln weltweit mit Rohstoffen und Waren.'],
  // Energie, Rohstoffe, Versorger, Immobilien
  'oil & gas integrated': ['Öl- & Gaskonzerne', 'Fördern, verarbeiten und verkaufen Öl und Gas.'],
  'oil & gas e&p': ['Öl- & Gasförderung', 'Suchen und fördern Öl und Gas.'],
  'oil & gas midstream': ['Pipelines', 'Transportieren und lagern Öl und Gas.'],
  'oil & gas equipment & services': ['Ölfeld-Dienstleister', 'Technik und Dienstleistungen für die Förderung.'],
  'oil & gas refining & marketing': ['Raffinerien', 'Verarbeiten Rohöl zu Kraftstoffen.'],
  'specialty chemicals': ['Spezialchemie', 'Chemische Produkte für besondere Anwendungen, etwa Industriegase und Lacke.'],
  chemicals: ['Chemie', 'Stellen chemische Grundstoffe her.'],
  'other industrial metals & mining': ['Bergbau', 'Fördern Metalle und Erze.'],
  gold: ['Goldminen', 'Fördern Gold.'],
  copper: ['Kupfer', 'Fördern und verarbeiten Kupfer.'],
  steel: ['Stahl', 'Stellen Stahl her.'],
  'building materials': ['Baustoffe', 'Zement, Beton und andere Baustoffe.'],
  'utilities - regulated electric': ['Stromversorger', 'Erzeugen und verteilen Strom.'],
  'utilities - diversified': ['Versorger', 'Liefern Strom, Gas und Wasser.'],
  'utilities - renewable': ['Erneuerbare Energien', 'Erzeugen Strom aus Wind, Sonne und Wasser.'],
  'utilities - independent power producers': ['Stromerzeuger', 'Erzeugen Strom und verkaufen ihn an Netzbetreiber.'],
  'reit - specialty': ['Spezial-Immobilien', 'Vermieten besondere Immobilien wie Funkmasten oder Rechenzentren.'],
  'reit - industrial': ['Logistik-Immobilien', 'Vermieten Lager- und Logistikhallen.'],
  'reit - residential': ['Wohnimmobilien', 'Vermieten Wohnungen.'],
  'reit - retail': ['Einzelhandels-Immobilien', 'Vermieten Läden und Einkaufszentren.'],
  'real estate services': ['Immobilien-Dienstleister', 'Vermitteln und verwalten Immobilien.'],
};

/** Yahoo schreibt mal mit Halbgeviertstrich („Software—Application“), mal mit Bindestrich. */
const normalize = (industry: string) => industry.toLowerCase().replace(/\s*[—–-]\s*/g, ' - ').replace(/\s+/g, ' ').trim();

export function industryInfo(industry: string): IndustryInfo {
  const known = INFO[normalize(industry)];
  return known ? { label: known[0], explain: known[1] } : { label: industry, explain: '' };
}

export interface IndustrySlice {
  label: string;
  explain: string;
  /** Anteil am gesamten Depot (nur aus den größten Firmen gerechnet) */
  weight: number;
  /** Die größten Firmen dieses Bereichs, größte zuerst */
  companies: string[];
}

export interface IndustryBreakdown {
  slices: IndustrySlice[];
  /** Anteil des Depots, den die zugeordneten Firmen zusammen ausmachen */
  covered: number;
  /** Anzahl der Firmen mit bekanntem Geschäftsbereich */
  known: number;
}

/**
 * Fasst die größten Firmen nach Geschäftsbereich zusammen.
 * @param industryOf Geschäftsbereich je Firmen-Schlüssel (Yahoos Schreibweise); null oder fehlend = unbekannt
 */
export function industryBreakdown(companies: CompanySlice[], industryOf: (key: string) => string | null | undefined): IndustryBreakdown {
  const byLabel = new Map<string, IndustrySlice>();
  let covered = 0;
  let known = 0;
  for (const c of companies) {
    const industry = industryOf(c.key);
    if (!industry) continue;
    const info = industryInfo(industry);
    const slice = byLabel.get(info.label) ?? { ...info, weight: 0, companies: [] };
    slice.weight += c.weight;
    slice.companies.push(c.label);
    byLabel.set(info.label, slice);
    covered += c.weight;
    known++;
  }
  return { slices: [...byLabel.values()].sort((a, b) => b.weight - a.weight), covered, known };
}
