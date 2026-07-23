# ============================================================
# TKTool Jira-Sync
# ------------------------------------------------------------
# Liest tktool-data.json aus dem TKTool-Datenordner, holt fuer
# jede Team-Person mit hinterlegtem "Jira User (E-Mail)" die
# offenen Tickets aus Jira Cloud und schreibt jira-tickets.json
# in denselben Ordner. TKTool liest die Datei automatisch ein.
#
# Benoetigt nur LESE-Rechte in Jira (Scopes: read:jira-work,
# read:jira-user). Das Skript aendert nichts in Jira.
#
# Aufruf:   powershell -ExecutionPolicy Bypass -File jira-sync.ps1
# Optional: -Config <pfad>   (Standard: jira-sync.config.json
#                             neben dem Skript)
# ============================================================
param(
  [string]$Config = (Join-Path $PSScriptRoot 'jira-sync.config.json')
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

# --- Konfiguration ------------------------------------------------
if (-not (Test-Path $Config)) {
  Write-Error "Konfigurationsdatei nicht gefunden: $Config`nVorlage: jira-sync.config.example.json kopieren und ausfuellen."
}
$cfg = Get-Content $Config -Raw | ConvertFrom-Json
foreach ($field in 'baseUrl', 'email', 'apiToken', 'dataDir') {
  if (-not $cfg.$field) { Write-Error "Feld '$field' fehlt in $Config" }
}
$baseUrl = $cfg.baseUrl.TrimEnd('/')
$dataFile = Join-Path $cfg.dataDir 'tktool-data.json'
$outFile = Join-Path $cfg.dataDir 'jira-tickets.json'
$jqlTemplate = if ($cfg.jql) { $cfg.jql } else { 'assignee = "{user}" AND resolution = Unresolved ORDER BY updated DESC' }
$maxResults = if ($cfg.maxResults) { [int]$cfg.maxResults } else { 50 }

if (-not (Test-Path $dataFile)) {
  Write-Error "tktool-data.json nicht gefunden in: $($cfg.dataDir)"
}

$authHeaders = @{
  'Authorization' = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($cfg.email):$($cfg.apiToken)"))
  'Accept'        = 'application/json'
}

# --- API-Basis ermitteln ------------------------------------------
# Klassische API-Tokens funktionieren direkt gegen die Site-URL.
# Gescopte Tokens (read:jira-work etc.) funktionieren nur ueber das
# Gateway api.atlassian.com/ex/jira/{cloudId} — daher: erst direkt
# probieren, bei 401/403 auf das Gateway ausweichen.
function Get-HttpStatus($err) {
  try { return [int]$err.Exception.Response.StatusCode } catch { return 0 }
}

$apiBase = $null
try {
  Invoke-RestMethod -Uri "$baseUrl/rest/api/3/myself" -Headers $authHeaders | Out-Null
  $apiBase = $baseUrl
} catch {
  $status = Get-HttpStatus $_
  if ($status -ne 401 -and $status -ne 403) { throw }
  $tenant = Invoke-RestMethod -Uri "$baseUrl/_edge/tenant_info"
  $gateway = "https://api.atlassian.com/ex/jira/$($tenant.cloudId)"
  Invoke-RestMethod -Uri "$gateway/rest/api/3/myself" -Headers $authHeaders | Out-Null
  $apiBase = $gateway
}
Write-Host "Verbunden ($apiBase)"

# --- Hilfsfunktionen ----------------------------------------------
$ticketFields = 'summary,status,priority,issuetype,updated'

function ConvertTo-Ticket($issue) {
  $f = $issue.fields
  [ordered]@{
    key            = $issue.key
    summary        = "$($f.summary)"
    status         = "$($f.status.name)"
    statusCategory = "$($f.status.statusCategory.key)"
    priority       = if ($f.priority) { "$($f.priority.name)" } else { '' }
    type           = if ($f.issuetype) { "$($f.issuetype.name)" } else { '' }
    updated        = "$($f.updated)"
  }
}

function Search-Jira([string]$jql) {
  $issues = New-Object System.Collections.Generic.List[object]
  $token = $null
  do {
    $url = "$apiBase/rest/api/3/search/jql?jql=$([uri]::EscapeDataString($jql))&fields=$ticketFields&maxResults=$maxResults"
    if ($token) { $url += "&nextPageToken=$([uri]::EscapeDataString($token))" }
    $res = Invoke-RestMethod -Uri $url -Headers $authHeaders
    foreach ($issue in @($res.issues)) { if ($issue) { $issues.Add($issue) } }
    $token = $res.nextPageToken
  } while ($token)
  return ,$issues
}

# --- Tickets pro Team-Person --------------------------------------
$data = Get-Content $dataFile -Raw | ConvertFrom-Json
$teamUsers = @($data.persons | Where-Object { $_.type -ne 'kontakt' -and $_.jiraUser } |
  ForEach-Object { $_.jiraUser.Trim().ToLower() } | Sort-Object -Unique)

if (-not $teamUsers.Count) {
  Write-Warning 'Keine Person hat einen Jira User (E-Mail) hinterlegt — es gibt nichts zu synchronisieren.'
}

$assignees = [ordered]@{}
foreach ($user in $teamUsers) {
  $jql = $jqlTemplate.Replace('{user}', $user)
  $issues = Search-Jira $jql
  $assignees[$user] = @($issues | ForEach-Object { ConvertTo-Ticket $_ })
  Write-Host ("  {0}: {1} offene Tickets" -f $user, $issues.Count)
}

# --- Status aller in Bloecken referenzierten Keys (refs) ----------
# TKTool braucht das, um veraltete Planner-Bloecke zu erkennen
# (Ticket erledigt oder umassigned).
$refKeys = @($data.blocks | Where-Object { $_.jiraRef } |
  ForEach-Object { $_.jiraRef.Trim().ToUpper() } | Sort-Object -Unique)

$refs = [ordered]@{}
foreach ($key in $refKeys) {
  try {
    $issue = Invoke-RestMethod -Uri "$apiBase/rest/api/3/issue/$key`?fields=status,assignee" -Headers $authHeaders
    $refs[$key] = [ordered]@{
      status         = "$($issue.fields.status.name)"
      statusCategory = "$($issue.fields.status.statusCategory.key)"
      assignee       = if ($issue.fields.assignee.emailAddress) { $issue.fields.assignee.emailAddress.ToLower() } else { $null }
    }
  } catch {
    $status = Get-HttpStatus $_
    # Unbekannte/geloeschte Keys oder fehlende Rechte: einfach weglassen,
    # TKTool faellt dann auf "keine Aussage" zurueck.
    if ($status -ne 404 -and $status -ne 403) { throw }
  }
}
Write-Host ("  refs: {0} von {1} Block-Referenzen aufgeloest" -f $refs.Count, $refKeys.Count)

# --- Schreiben (atomar: erst .tmp, dann ersetzen) ------------------
$out = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  source      = $baseUrl
  jql         = $jqlTemplate
  assignees   = $assignees
  refs        = $refs
}
$json = $out | ConvertTo-Json -Depth 6
$tmp = "$outFile.tmp"
[IO.File]::WriteAllText($tmp, $json, (New-Object Text.UTF8Encoding($false)))
Move-Item -Force $tmp $outFile
Write-Host "Geschrieben: $outFile"
