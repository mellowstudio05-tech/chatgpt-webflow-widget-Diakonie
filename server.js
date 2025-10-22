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

// Webflow API URLs (fügen Sie hier Ihre API-URLs hinzu)
const WEBFLOW_API_URLS = [
    // Beispiel: 'https://api.webflow.com/v2/collections/your-collection-id/items',
    // Fügen Sie hier Ihre Webflow API-URLs hinzu
];

// Web-Scraping Funktion für HTML-Seiten
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
            
            // Entferne Script- und Style-Tags
            $('script, style, nav, footer, header').remove();
            
            // Extrahiere Text-Inhalte
            const pageContent = {
                url: url,
                title: $('title').text().trim(),
                content: $('body').text().replace(/\s+/g, ' ').trim()
            };
            
            content.push(pageContent);
            console.log(`Content scraped from: ${url}`);
            
        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
        }
    }
    
    return content;
}

// Webflow API Funktion
async function fetchWebflowContent() {
    const content = [];
    
    // Prüfe ob Webflow API Token vorhanden ist
    if (!process.env.WEBFLOW_API_TOKEN) {
        console.log('⚠️  Webflow API Token nicht gesetzt - überspringe Webflow APIs');
        return content;
    }
    
    // Prüfe ob Webflow URLs konfiguriert sind
    if (WEBFLOW_API_URLS.length === 0) {
        console.log('⚠️  Keine Webflow API URLs konfiguriert');
        return content;
    }
    
    for (const apiUrl of WEBFLOW_API_URLS) {
        try {
            const response = await axios.get(apiUrl, {
                timeout: 10000,
                headers: {
                    'Authorization': `Bearer ${process.env.WEBFLOW_API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // Webflow API gibt JSON zurück
            const data = response.data;
            
            if (data.items && Array.isArray(data.items)) {
                data.items.forEach((item, index) => {
                    const pageContent = {
                        url: apiUrl,
                        title: item.name || item.title || `Webflow Item ${index + 1}`,
                        content: JSON.stringify(item).replace(/\s+/g, ' ').trim()
                    };
                    content.push(pageContent);
                });
            } else if (data.data && Array.isArray(data.data)) {
                data.data.forEach((item, index) => {
                    const pageContent = {
                        url: apiUrl,
                        title: item.name || item.title || `Webflow Item ${index + 1}`,
                        content: JSON.stringify(item).replace(/\s+/g, ' ').trim()
                    };
                    content.push(pageContent);
                });
            } else {
                // Fallback für andere API-Strukturen
                const pageContent = {
                    url: apiUrl,
                    title: 'Webflow API Data',
                    content: JSON.stringify(data).replace(/\s+/g, ' ').trim()
                };
                content.push(pageContent);
            }
            
            console.log(`Webflow API data fetched from: ${apiUrl}`);
            
        } catch (error) {
            console.error(`Error fetching Webflow API ${apiUrl}:`, error.message);
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
        console.log('Fetching fresh content...');
        
        // Kombiniere beide Datenquellen
        const [diakonieContent, webflowContent] = await Promise.all([
            scrapeDiakonieContent(),
            fetchWebflowContent()
        ]);
        
        scrapedContent = [...diakonieContent, ...webflowContent];
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

- Für Überschriften: <h3>Überschrift</h3>
- Für nummerierte Listen: <ol><li><strong>Titel</strong> - Beschreibung</li></ol>
- Für Aufzählungen: <ul><li><strong>Titel</strong> - Beschreibung</li></ul>
- Für wichtige Texte: <strong>Wichtiger Text</strong>
- Für Absätze: <p>Text</p>

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
        const enhancedSystemPrompt = SYSTEM_PROMPT + '\n\nAKTUELLE WEBSITE-INHALTE:\n' + 
            currentContent.map(page => `URL: ${page.url}\nTitel: ${page.title}\nInhalt: ${page.content.substring(0, 2000)}...`).join('\n\n');

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
    
    // API-Keys prüfen
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNUNG: OPENAI_API_KEY nicht gesetzt!');
    } else {
        console.log('✅ OpenAI API Key konfiguriert');
    }
    
    if (!process.env.WEBFLOW_API_TOKEN) {
        console.warn('⚠️  WARNUNG: WEBFLOW_API_TOKEN nicht gesetzt! Webflow APIs werden übersprungen.');
    } else {
        console.log('✅ Webflow API Token konfiguriert');
    }
    
    // Initiales Scraping beim Start
    console.log('🔄 Starte initiales Scraping der Diakonie-Website...');
    getCurrentContent().then(() => {
        console.log('✅ Initiales Scraping abgeschlossen');
    }).catch(error => {
        console.error('❌ Fehler beim initialen Scraping:', error.message);
    });
});

