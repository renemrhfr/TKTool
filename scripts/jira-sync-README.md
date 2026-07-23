# Jira-Sync einrichten (Windows)

Das Skript `jira-sync.ps1` holt die offenen Jira-Tickets des Teams und
schreibt `jira-tickets.json` in den TKTool-Datenordner. TKTool liest die
Datei beim Start ein; danach genügt F5 oder ein Klick auf den Stempel
„stand: …" in der Jira-Karte, um den Snapshot neu einzulesen. Ohne die
Datei bleibt das Jira-Feature unsichtbar.

Das Skript liest ausschließlich aus Jira — es ändert dort nichts.

## 1. API-Token erstellen (nur Lesen)

1. https://id.atlassian.com/manage-profile/security/api-tokens
2. **"Create API token with scopes"** wählen (nicht das klassische Token)
3. App: **Jira**, Scopes: `read:jira-work` und `read:jira-user`
4. Token kopieren — es kann damit nichts in Jira geändert werden.

## 2. Konfigurieren

1. `jira-sync.config.example.json` kopieren nach `jira-sync.config.json`
   (liegt neben dem Skript, ist gitignored — das Token bleibt lokal)
2. Ausfüllen: `baseUrl` (https://firma.atlassian.net), `email` (eigener
   Jira-Login), `apiToken`, `dataDir` (der Ordner, den TKTool als
   Datenordner nutzt — dort liegt `tktool-data.json`)

## 3. Testlauf

```
powershell -ExecutionPolicy Bypass -File jira-sync.ps1
```

Ausgabe pro Person „N offene Tickets", am Ende „Geschrieben: …".
Danach in TKTool: Team-Ansicht öffnen → Ticketliste sichtbar.

Wichtig: Personen brauchen im Formular das Feld **„Jira User (E-Mail)"**
— nur Team-Mitglieder mit dieser E-Mail werden synchronisiert.

## 4. Automatisch per Aufgabenplanung

Einmalig in einer PowerShell ausführen (Pfad anpassen):

```powershell
$script = "C:\Pfad\zu\jira-sync.ps1"
schtasks /Create /TN "TKTool Jira-Sync" /SC HOURLY /MO 1 `
  /TR "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`"" `
  /ST 08:00
```

Oder über die GUI: Aufgabenplanung → „Einfache Aufgabe erstellen" →
Trigger „Täglich", dann in den Eigenschaften unter Trigger „Wiederholen
alle: 1 Stunde" aktivieren → Aktion „Programm starten":
`powershell` mit Argumenten
`-WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Pfad\zu\jira-sync.ps1"`.

Der Stempel „stand: vor N min" in TKTool zeigt, wie frisch die Daten sind.
Ein Klick darauf liest die Datei neu ein (startet das Skript nicht — das
kann der Browser aus Sicherheitsgründen nicht).

## Warum PowerShell und nicht Git Bash?

PowerShell ist auf jedem Windows-Gerät vorhanden und bringt JSON-Parsing
(`ConvertFrom-Json` / `ConvertTo-Json`) mit — das Skript muss
`tktool-data.json` lesen und `jira-tickets.json` schreiben. In Git Bash
gäbe es zwar `curl`, aber kein `jq`, JSON müsste also von Hand geparst
werden. Zudem startet die Aufgabenplanung `powershell.exe` direkt.
