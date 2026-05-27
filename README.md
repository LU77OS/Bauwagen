# 🏠 Bauwagen Shop

Digitale Strichliste für den Bauwagen. Läuft als Web App auf iPad.

## Features
- Kiosk-Modus: Person wählen → Produkte tippen → Buchen
- Historische Preise (Preisänderungen beeinflussen alte Buchungen nicht)
- Lagerbestand automatisch aktualisiert
- Admin-Bereich: Produkte, Personen, Inventur, Einkauf, Monatsabrechnung
- PayPal-Links pro Person für die Abrechnung

## Deployment auf Railway (kostenlos, empfohlen)

### 1. GitHub Repository anlegen
1. Gehe zu github.com → "New repository" → Name: `bauwagen`
2. Alle Dateien hochladen (oder per Git push)

### 2. Railway deployen
1. Gehe zu railway.app → mit GitHub einloggen
2. "New Project" → "Deploy from GitHub repo" → `bauwagen` auswählen
3. Railway erkennt Node.js automatisch
4. Unter "Variables" folgende Variable hinzufügen:
   - `DATA_DIR` = `/app/data`
5. Unter "Settings" → "Networking" → "Generate Domain"
6. Fertig! Du bekommst eine URL wie `bauwagen.up.railway.app`

### 3. iPad einrichten
1. URL im Safari öffnen
2. Teilen-Button → "Zum Home-Bildschirm" → "Hinzufügen"
3. App startet jetzt fullscreen wie eine native App

## Lokale Installation (für Tests)

```bash
npm install
npm start
```

Dann im Browser: http://localhost:3000

## Admin-Bereich
- Standard-Passwort: `1234`
- Bitte sofort ändern unter Einstellungen!

## Datenbank
SQLite-Datei unter `/data/bauwagen.db` — wird automatisch angelegt.
Bei Railway wird der `/data` Ordner als Volume gemountet (persistent).
