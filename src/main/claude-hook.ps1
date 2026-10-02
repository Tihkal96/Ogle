# Read Claude's hook input but persist only lifecycle metadata, never prompt or
# tool contents. No output means the CLI's normal permission decision is intact.
$ErrorActionPreference = 'Stop'
try {
  $ogleHook = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $ogleEvent = @{
    event = [string]$ogleHook.hook_event_name
    notification = [string]$ogleHook.notification_type
    sessionId = [string]$ogleHook.session_id
    agentId = [string]$ogleHook.agent_id
  }
  $ogleName = [DateTime]::UtcNow.Ticks.ToString() + '-' + [Guid]::NewGuid().ToString() + '.event.json'
  $ogleTarget = Join-Path $ogleEventDir $ogleName
  $ogleTemp = $ogleTarget + '.tmp'
  [IO.File]::WriteAllText($ogleTemp, ($ogleEvent | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
  [IO.File]::Move($ogleTemp, $ogleTarget)
} catch {
  # A decorative animation must never block Claude Code.
}
exit 0
