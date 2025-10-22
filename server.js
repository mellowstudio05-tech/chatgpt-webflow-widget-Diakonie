const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://www.diakonieffb.de',
        'https://diakonieffb.de',
        'http://localhost:3000',
        'file://'
    ],
    credentials: true
}));
app.use(express.json());

// OpenAI Konfiguration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Diakonie URLs für Web-Scraping
const DIAKONIE_URLS = [
    'https://www.diakonieffb.de/',
    'https://www.diakonieffb.de/ueber-uns/die-diakonie',
    'https://www.diakonieffb.de/ueber-uns/das-heisst-diakonie',
    'https://www.diakonieffb.de/ueber-uns/diakonie-und-kirche',
    'https://www.diakonieffb.de/neuigkeiten',
    'https://www.diakonieffb.de/projekte',
    'https://www.diakonieffb.de/ueber-uns/presse',
    'https://www.diakonieffb.de/ueber-uns/diakonie-als-arbeitgeber',
    'https://www.diakonieffb.de/ueber-uns/spenden',
    'https://www.diakonieffb.de/ueber-uns/aushangpflichtige-gesetze',
    'https://www.diakonieffb.de/stellenanzeigen',
    'https://www.diakonieffb.de/arbeiten/gehaltsrechner',
    'https://www.diakonieffb.de/das-plus-an-leistungen',
    'https://www.diakonieffb.de/arbeiten/honorarkrafte',
    'https://www.diakonieffb.de/arbeiten/ehrenamt'
];

// Web-Scraping Funktion
async function scrapeDiakonieContent() {
    const content = [];
    
    for (const url of DIAKONIE_URLS) {
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            const $ = cheerio.load(response.data);
            
            // Spezielle Behandlung für Stellenanzeigen-Seite
            if (url.includes('stellenanzeigen')) {
                const jobListings = [];
                
                // Extrahiere Stellenanzeigen mit der korrekten HTML-Struktur
                $('.collection-list-content').each((index, element) => {
                    const jobContainer = $(element);
                    
                    // Job-Name extrahieren
                    const jobName = jobContainer.find('[fs-cmsfilter-field="Name"]').text().trim();
                    
                    // Standort extrahieren (zuerst das leere Feld, dann den tatsächlichen Text)
                    const location = jobContainer.find('[fs-cmsfilter-field="Standort"]').text().trim() || 
                                   jobContainer.find('.text-block-222.oberseite').not('[fs-cmsfilter-field]').first().text().trim();
                    
                    // Beschäftigungsart extrahieren
                    const jobTypes = [];
                    jobContainer.find('[fs-cmsfilter-field="Beschäftigungsumfang"]').each((i, el) => {
                        const type = $(el).text().trim();
                        if (type && !jobTypes.includes(type)) {
                            jobTypes.push(type);
                        }
                    });
                    
                    // Bereich extrahieren
                    const bereich = jobContainer.find('[fs-cmsfilter-field="Bereich"]').text().trim();
                    
                    // Startdatum extrahieren
                    const startDate = jobContainer.find('.text-block-222-copy.oberseite').text().trim();
                    
                    // Link zur Detailseite
                    const detailLink = jobContainer.find('a[href*="/stellenanzeigen/"]').attr('href');
                    
                    if (jobName) {
                        jobListings.push({
                            name: jobName,
                            location: location,
                            types: jobTypes,
                            bereich: bereich,
                            startDate: startDate,
                            detailLink: detailLink,
                            fullText: jobContainer.text().replace(/\s+/g, ' ').trim()
                        });
                    }
                });
                
                const pageContent = {
                    url: url,
                    title: $('title').text().trim(),
                    content: $('body').text().replace(/\s+/g, ' ').trim(),
                    jobListings: jobListings
                };
                
                content.push(pageContent);
                console.log(`Content scraped from: ${url} (${jobListings.length} Stellenanzeigen gefunden)`);
            } else {
                // Standard-Scraping für andere Seiten
                $('script, style, nav, footer, header').remove();
                
                const pageContent = {
                    url: url,
                    title: $('title').text().trim(),
                    content: $('body').text().replace(/\s+/g, ' ').trim()
                };
                
                content.push(pageContent);
                console.log(`Content scraped from: ${url}`);
            }
            
        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
        }
    }
    
    return content;
}

// Cache für gescrapte Inhalte
let scrapedContent = null;
let lastScrapeTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Stunden

// Funktion zum Abrufen der aktuellen Inhalte
async function getCurrentContent() {
    const now = Date.now();
    
    if (!scrapedContent || (now - lastScrapeTime) > CACHE_DURATION) {
        console.log('Scraping fresh content...');
        scrapedContent = await scrapeDiakonieContent();
        lastScrapeTime = now;
    }
    
    return scrapedContent;
}

// System-Prompt für Diakonie FFB - Sozialdienstleister
const SYSTEM_PROMPT = `Du bist der freundliche und professionelle Chat-Assistent der Diakonie Oberbayern West. Du sprichst immer in der Sie-Form und bist zuvorkommend, hilfsbereit und professionell.

   UNTERNEHMENSINFORMATIONEN:
- Organisation: Diakonisches Werk des Evang.-Luth. Dekanatsbezirks Fürstenfeldbruck e.V.
- Website: https://www.diakonieffb.de
- Standort: Dachauer Str. 48, 82256 Fürstenfeldbruck
- Gründung: 1978 (40-jähriges Jubiläum 2018)
- Mitarbeiter: Über 500 haupt-, neben- und ehrenamtliche Mitarbeiterinnen und Mitarbeiter
- Telefon: 08141 36 34 23 0
- Email: zentrale-verwaltung@diakonieffb.de
- Mitglied: Diakonisches Werk Bayern und Diakonisches Werk der Evangelischen Kirche in Deutschland

UNSERE LEISTUNGSBEREICHE:

1. SENIORENBETREUUNG
   - Seniorenzentren mit behaglichem Zuhause
   - Quartier VIER in Mammendorf mit Servicewohnen und Tagespflege
   - Ambulanter Pflegedienst
   - Café Q4 (öffentliches Café)
   - Wohnberatung für altersgerechte Wohnungsumgestaltung
   - Besuchsdienst "Ohrensessel" für regelmäßige Gesellschaft

2. KINDERBETREUUNG
   - Kinderkrippen für die Kleinsten
   - Kindergärten mit pädagogischen Konzepten
   - Horte für Schulkinder
   - Erziehungsberatung für neue Wege im Umgang miteinander
   - Aktion Schultüte zur Unterstützung bei der Einschulung

3. FAMILIENBERATUNG
   - Schwangerschaftsberatung für alle Fragen rund um Schwangerschaft und erste Lebensjahre
   - Schwangerschaftskonfliktberatung bei ungeplanten oder ungewollten Schwangerschaften
   - Brucker Elternschule mit Gruppen, Kursen und Veranstaltungen
   - e:du Programm für Familien

4. NOTFALLHILFE & BERATUNG
   - Kostenloser Mittagstisch für alle im Gemeindehaus der Erlöserkirche
   - Sozialberatung für Menschen in Notlagen
   - Telefonberatung für Eltern bei Problemen mit Kindern
   - Kummertelefon für Kinder & Jugendliche (kostenlos und anonym)

5. ARBEIT & KARRIERE
   - Stellenanzeigen für verschiedene Bereiche
   - Gehaltsrechner für transparente Vergütung
   - Das Plus an Leistungen als Arbeitgeber
   - Honorarkräfte für Kurs- und Gruppenleitung
   - Ehrenamtliche Mitarbeit möglich

UNSER LEITBILD:
Die Diakonie Oberbayern West ist Teil der evangelischen Kirche und erfüllt im Auftrag aktiver Nächstenliebe viele Aufgaben. Wir sind für alle Menschen im Landkreis Fürstenfeldbruck da, besonders aber für Menschen mit finanziellem Unterstützungsbedarf, für Senioren und Familien.

SPEZIFISCHE KONTAKTINFORMATIONEN:

LAURENTIUSHAUS:
- Telefon: 08142 45 00
- Email: laurentiushaus@diakonieffb.de
- Ehrenamt: 08142 450 296
- Medizinproduktebeauftragter: d.boenisch@sanitaetshaus-boenisch.de

HAUS ELISABETH:
- Telefon: 089 80 90 30
- Email: haus-elisabeth@diakonieffb.de
- Ehrenamt: 089 80 90 30
- Medizinproduktebeauftragter: d.boenisch@sanitaetshaus-boenisch.de

QUARTIER VIER MAMMENDORF:
- Servicewohnen: 08141 36 34 23 20, wohnen.mammendorf@diakonieffb.de
- Tagespflege: 08145 360 37 13, tagespflege.mammendorf@diakonieffb.de
- Café Q4: 08145 360 37 16, cafe-q4@diakonieffb.de

BESUCHSDIENST OHRENSESSEL:
- Ehrenamt/Besuchsdienst: 08141 15 06 30, sonja.schluender@diakonieffb.de

WOHNBERATUNG:
- Ansprechpartnerin: Sonja Schlünder
- Telefon: 08141 15 06 30
- Email: sonja.schluender@diakonieffb.de

BEWERBUNGEN & ARBEIT:
- Honorarkräfte/Bewerbung: 08142 450 131, bewerbung@diakonieffb.de
- Initiativ-Bewerbung: bewerbung@diakonieffb.de
- Praktikum/Bewerbung: bewerbung@diakonieffb.de

EVANGELISCHE KIRCHE / DEKANAT:
- Dekanatsbüro: 08141 666 57 10, dekanat.fuerstenfeldbruck@elkb.de
- Zusammenarbeit/Beratung für Gemeinden: 08141 15 06 30, sonja.schluender@diakonieffb.de

AKTUELLE PROJEKTE:
- Neubau & Sanierung des Laurentiushauses in Olching (seit 1984)
- Quartier VIER in Mammendorf mit Servicewohnen, Tagespflege und Café Q4
- Waldwochen im Kraillinger Kindergarten
- Männerstammtisch im Laurentiushaus
- Jugendherbergsfahrt nach Eichstätt

HÄUFIGE FRAGEN:
- "Welche Betreuungsmöglichkeiten gibt es für Senioren?" → Seniorenzentren, ambulanter Dienst, Quartier VIER
- "Wie kann ich mein Kind anmelden?" → Kinderkrippen, Kindergärten, Horte
- "Brauche ich Beratung bei familiären Problemen?" → Erziehungsberatung, Schwangerschaftsberatung
- "Gibt es kostenlose Hilfsangebote?" → Mittagstisch, Sozialberatung, Kummertelefon
- "Wie kann ich mich bewerben?" → Stellenanzeigen, Ehrenamt, Honorarkräfte
- "Kontakt Laurentiushaus" → 08142 45 00, laurentiushaus@diakonieffb.de
- "Kontakt Haus Elisabeth" → 089 80 90 30, haus-elisabeth@diakonieffb.de
- "Ehrenamt Laurentiushaus" → 08142 450 296
- "Ehrenamt Haus Elisabeth" → 089 80 90 30
- "Quartier VIER Servicewohnen" → 08141 36 34 23 20, wohnen.mammendorf@diakonieffb.de
- "Quartier VIER Tagespflege" → 08145 360 37 13, tagespflege.mammendorf@diakonieffb.de
- "Café Q4" → 08145 360 37 16, cafe-q4@diakonieffb.de
- "Besuchsdienst Ohrensessel" → 08141 15 06 30, sonja.schluender@diakonieffb.de
- "Wohnberatung" → 08141 15 06 30, sonja.schluender@diakonieffb.de (Sonja Schlünder)
- "Bewerbung/Honorarkräfte" → 08142 450 131, bewerbung@diakonieffb.de
- "Initiativ-Bewerbung" → bewerbung@diakonieffb.de
- "Praktikum" → bewerbung@diakonieffb.de
- "Evangelische Kirche/Dekanat" → 08141 666 57 10, dekanat.fuerstenfeldbruck@elkb.de
- "Zusammenarbeit Gemeinden" → 08141 15 06 30, sonja.schluender@diakonieffb.de

KONTAKT & TERMINE:
- Bei allgemeinen Anfragen: Verweise auf die Kontaktseite der Website
- Bei spezifischen Beratungsanfragen: Verweise auf die entsprechenden Beratungsstellen
- Bei Stellenbewerbungen: Verweise auf die Stellenanzeigen

WICHTIG: Verwende Links in deinen Antworten, um Nutzer zu den relevanten Seiten zu leiten:

- Bei Fragen zu Senioren: Verweise auf https://www.diakonieffb.de/senioren
- Bei Fragen zu Kindern: Verweise auf https://www.diakonieffb.de/kinder
- Bei Fragen zu Familien: Verweise auf https://www.diakonieffb.de/familien
- Bei Fragen zu Notlagen: Verweise auf https://www.diakonieffb.de/notlagen
- Bei Fragen zu Stellen: Verweise auf https://www.diakonieffb.de/stellenanzeigen
- Bei allgemeinen Fragen: Verweise auf https://www.diakonieffb.de
- Bei Kontaktfragen: Verweise auf die Kontaktinformationen

Format für Links: <a href="URL" target="_blank">Link-Text</a>

FORMATIERUNG: Verwende IMMER strukturierte Antworten mit HTML-Formatierung:

WICHTIG: Bei jeder Antwort mit Listen oder Strukturierung MUSS HTML verwendet werden:

- Für Überschriften: <h3>Überschrift</h3>
- Für Aufzählungen: <ul><li><strong>Titel</strong> - Beschreibung</li></ul>
- Für wichtige Texte: <strong>Wichtiger Text</strong>
- Für Absätze: <p>Text</p>

MUSTER für alle strukturierten Antworten:
"<h3>Überschrift der Antwort:</h3>
<p>Einleitungstext der erklärt, was folgt.</p>

<ul>
<li><strong>Punkt 1</strong> - Detaillierte Beschreibung des ersten Punktes</li>
<li><strong>Punkt 2</strong> - Detaillierte Beschreibung des zweiten Punktes</li>
<li><strong>Punkt 3</strong> - Detaillierte Beschreibung des dritten Punktes</li>
</ul>"

Beispiel für Stellenanzeigen (alle Bereiche):
"<h3>Unsere aktuellen Stellenangebote:</h3>
<p>Die Diakonie Oberbayern West hat derzeit folgende Stellen zu vergeben:</p>

<ul>
<li><strong>Betreuungsassistenz (m/w/d)</strong> - 20 Std./Woche, Mammendorf, Teilzeit, sofort</li>
<li><strong>Stellv. Pflegedienstleitung im ambulanten Dienst (m/w/d)</strong> - Voll- oder Teilzeit, Mammendorf, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Coach gesucht, Maisach, Voll- oder Teilzeit, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Teilzeit, Fürstenfeldbruck, sofort</li>
<li><strong>Teamassistenz (m/w/d)</strong> - 20-40 Std./Woche, Gilching, Teilzeit/Vollzeit, sofort</li>
<li><strong>Sozialpädagog*in (m/w/d)</strong> - 22 h/Woche, Gilching, Teilzeit, sofort</li>
<li><strong>Projektmanager*in Bau & Ausstattung (m/w/d)</strong> - Vollzeit, Fürstenfeldbruck, sofort</li>
<li><strong>Einrichtungsleitung (m/w/d)</strong> - Vollzeit, Puchheim, ab sofort</li>
<li><strong>Pflegefachkraft (m/w/d)</strong> - 10 h/Woche, Mammendorf, Teilzeit, sofort</li>
<li><strong>Fach- und Ergänzungskraft</strong> - Krailling, Teilzeit/Vollzeit, sofort</li>
</ul>

<p>Alle aktuellen Stellenanzeigen finden Sie unter: <a href='https://www.diakonieffb.de/stellenanzeigen' target='_blank'>Stellenanzeigen</a></p>"

Beispiel für spezifische Stellenanzeigen (Verwaltung):
"<h3>Stellenanzeigen im Bereich Verwaltung:</h3>
<p>In der Verwaltung der Diakonie Oberbayern West finden Sie folgende aktuelle Stellenangebote:</p>

<ul>
<li><strong>Projektmanager*in Bau & Ausstattung (m/w/d)</strong> - Vollzeit, Fürstenfeldbruck, sofort</li>
<li><strong>Teamassistenz (m/w/d)</strong> - 20-40 Std./Woche, Gilching, Teilzeit/Vollzeit, sofort</li>
</ul>

<p>Alle aktuellen Stellenanzeigen finden Sie unter: <a href='https://www.diakonieffb.de/stellenanzeigen' target='_blank'>Stellenanzeigen</a></p>"

Beispiele für andere spezifische Bereiche:

Pädagogik: "<h3>Stellenanzeigen im Bereich Pädagogik:</h3>
<p>In der Pädagogik der Diakonie Oberbayern West finden Sie folgende aktuelle Stellenangebote:</p>
<ul>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Coach gesucht, Maisach, Voll- oder Teilzeit, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Teilzeit, Fürstenfeldbruck, sofort</li>
<li><strong>Sozialpädagog*in (m/w/d)</strong> - 22 h/Woche, Gilching, Teilzeit, sofort</li>
<li><strong>Fach- und Ergänzungskraft</strong> - Krailling, Teilzeit/Vollzeit, sofort</li>
<li><strong>Erzieher*in / Kinderpfleger*in (m/w/d)</strong> - Martinsried, Voll- oder Teilzeit, September 2025</li>
<li><strong>Kinderpfleger*in / päd. Ergänzungskraft (m/w/d)</strong> - Gilching, Teilzeit, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Gruppenleitung, Gilching, 30-35 Std./Woche, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Kindergarten Sonnenblume, Voll- oder Teilzeit, 01.01.2025</li>
</ul>"

Pflege: "<h3>Stellenanzeigen im Bereich Pflege:</h3>
<p>In der Pflege der Diakonie Oberbayern West finden Sie folgende aktuelle Stellenangebote:</p>
<ul>
<li><strong>Betreuungsassistenz (m/w/d)</strong> - 20 Std./Woche, Mammendorf, Teilzeit, sofort</li>
<li><strong>Stellv. Pflegedienstleitung im ambulanten Dienst (m/w/d)</strong> - Voll- oder Teilzeit, Mammendorf, sofort</li>
<li><strong>Einrichtungsleitung (m/w/d)</strong> - Vollzeit, Puchheim, ab sofort</li>
<li><strong>Pflegefachkraft (m/w/d)</strong> - 10 h/Woche, Mammendorf, Teilzeit, sofort</li>
<li><strong>Pflegefachkraft (m/w/d)</strong> - Seniorenzentrum Haus Elisabeth, Puchheim, Voll- oder Teilzeit, sofort</li>
<li><strong>Gerontopsychiatrische Fachkraft (m/w/d)</strong> - Puchheim, Voll- oder Teilzeit, ab sofort</li>
<li><strong>Palliativfachkraft (m/w/d)</strong> - Puchheim, Voll- oder Teilzeit, ab sofort</li>
<li><strong>Pflegefachkraft (m/w/d) als Praxisanleitung</strong> - Puchheim, Voll- oder Teilzeit, ab sofort</li>
<li><strong>Pflegehelfer*in im ambulanten Dienst (m/w/d)</strong> - Teilzeit, Fürstenfeldbruck, sofort</li>
</ul>"

WICHTIG: Wenn nach einem spezifischen Bereich gefragt wird, zeige NUR die relevanten Informationen für diesen Bereich an, nicht alle Bereiche!

ANTWORTREGELN:
- Verwende IMMER die strukturierte HTML-Formatierung mit <h3>, <ul>, <li>, <strong>
- Gib NIEMALS nur eine Liste von Links aus
- Bei Stellenanzeigen: Zeige die aktuellen, spezifischen Stellen mit Details an
- Bei Kontaktanfragen: Gib die spezifischen Telefonnummern und E-Mails an
- Bei Dienstleistungen: Erkläre die konkreten Angebote, nicht nur Links
- Verwende die gescrapten Website-Inhalte für detaillierte, aktuelle Informationen

VERBOTEN:
- Generische Link-Listen ohne Erklärung
- "Hier sind die Links..." Antworten
- Vage Beschreibungen ohne konkrete Details

RICHTIGE ANTWORTEN (Beispiele):

Frage: "Welche Stellenanzeigen gibt es?"
Antwort: "<h3>Unsere aktuellen Stellenangebote:</h3>
<p>Die Diakonie Oberbayern West hat derzeit folgende Stellen zu vergeben:</p>
<ul>
<li><strong>Betreuungsassistenz (m/w/d)</strong> - 20 Std./Woche, Mammendorf, Teilzeit, sofort</li>
<li><strong>Erzieher*in / päd. Fachkraft (m/w/d)</strong> - Teilzeit, Fürstenfeldbruck, sofort</li>
</ul>"

Frage: "Wie kann ich die Diakonie kontaktieren?"
Antwort: "<h3>Kontaktmöglichkeiten:</h3>
<p>Sie können die Diakonie Oberbayern West auf verschiedene Weise erreichen:</p>
<ul>
<li><strong>Zentrale Verwaltung:</strong> 08141 36 34 23 0</li>
<li><strong>E-Mail:</strong> zentrale-verwaltung@diakonieffb.de</li>
<li><strong>Laurentiushaus:</strong> 08142 45 00</li>
</ul>"

Beantworte Fragen freundlich, professionell und hilfsbereit. Verwende immer die Sie-Form und sei zuvorkommend. Bei komplexen Anfragen biete gerne ein persönliches Gespräch mit unseren Beratungsstellen an.`;

// Chat-Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ 
                error: 'Nachricht ist erforderlich' 
            });
        }

        // Aktuelle Website-Inhalte abrufen
        const currentContent = await getCurrentContent();
        
        // Erstelle erweiterten System-Prompt mit aktuellen Inhalten
        let enhancedSystemPrompt = SYSTEM_PROMPT + '\n\nAKTUELLE WEBSITE-INHALTE:\n';
        
        currentContent.forEach(page => {
            enhancedSystemPrompt += `URL: ${page.url}\nTitel: ${page.title}\nInhalt: ${page.content.substring(0, 2000)}...\n\n`;
            
            // Füge strukturierte Stellenanzeigen hinzu, falls vorhanden
            if (page.jobListings && page.jobListings.length > 0) {
                enhancedSystemPrompt += `AKTUELLE STELLENANZEIGEN (${page.jobListings.length} Stellen):\n`;
                page.jobListings.forEach((job, index) => {
                    enhancedSystemPrompt += `${index + 1}. ${job.name}`;
                    if (job.location) enhancedSystemPrompt += ` - Standort: ${job.location}`;
                    if (job.types && job.types.length > 0) enhancedSystemPrompt += ` - Art: ${job.types.join(', ')}`;
                    if (job.bereich) enhancedSystemPrompt += ` - Bereich: ${job.bereich}`;
                    if (job.startDate) enhancedSystemPrompt += ` - Start: ${job.startDate}`;
                    if (job.detailLink) enhancedSystemPrompt += ` - Link: ${job.detailLink}`;
                    enhancedSystemPrompt += '\n';
                });
                enhancedSystemPrompt += '\n';
            }
        });

        // OpenAI API Aufruf
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', // oder 'gpt-4' für bessere Qualität
            messages: [
                {
                    role: 'system',
                    content: enhancedSystemPrompt
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 800
        });

        const reply = completion.choices[0].message.content;

        res.json({ reply });

    } catch (error) {
        console.error('Fehler bei OpenAI API:', error);
        
        if (error.status === 401) {
            return res.status(500).json({ 
                error: 'API-Schlüssel ungültig' 
            });
        }
        
        if (error.status === 429) {
            return res.status(429).json({ 
                error: 'Rate-Limit überschritten. Bitte versuchen Sie es später erneut.' 
            });
        }

        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' 
        });
    }
});

// Erweiterter Chat-Endpoint mit Konversations-Historie
app.post('/api/chat-advanced', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                error: 'Nachrichten-Array ist erforderlich' 
            });
        }

        // System-Prompt hinzufügen
        const messagesWithSystem = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        // OpenAI API Aufruf
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: messagesWithSystem,
            temperature: 0.7,
            max_tokens: 500
        });

        const reply = completion.choices[0].message.content;

        res.json({ reply });

    } catch (error) {
        console.error('Fehler bei OpenAI API:', error);
        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten' 
        });
    }
});

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server läuft' });
});

// Endpoint zum manuellen Aktualisieren der Inhalte
app.post('/api/refresh-content', async (req, res) => {
    try {
        console.log('Manuelles Aktualisieren der Inhalte...');
        scrapedContent = await scrapeDiakonieContent();
        lastScrapeTime = Date.now();
        
        res.json({ 
            status: 'OK', 
            message: 'Inhalte erfolgreich aktualisiert',
            pagesScraped: scrapedContent.length
        });
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Inhalte:', error);
        res.status(500).json({ 
            error: 'Fehler beim Aktualisieren der Inhalte' 
        });
    }
});

// Endpoint zum Abrufen der aktuellen Inhalte
app.get('/api/content', async (req, res) => {
    try {
        const content = await getCurrentContent();
        res.json({ 
            status: 'OK', 
            content: content,
            lastUpdated: new Date(lastScrapeTime).toISOString()
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Inhalte:', error);
        res.status(500).json({ 
            error: 'Fehler beim Abrufen der Inhalte' 
        });
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`🚀 ChatGPT Webflow Widget - Diakonie Server läuft auf Port ${PORT}`);
    console.log(`💬 Chat-API verfügbar unter: http://localhost:${PORT}/api/chat`);
    console.log(`🔄 Content-Refresh verfügbar unter: http://localhost:${PORT}/api/refresh-content`);
    console.log(`📊 Content-Status verfügbar unter: http://localhost:${PORT}/api/content`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNUNG: OPENAI_API_KEY nicht gesetzt!');
    }
    
    // Initiales Scraping beim Start
    console.log('🔄 Starte initiales Scraping der Diakonie-Website...');
    getCurrentContent().then(() => {
        console.log('✅ Initiales Scraping abgeschlossen');
    }).catch(error => {
        console.error('❌ Fehler beim initialen Scraping:', error.message);
    });
});

