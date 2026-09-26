$ErrorActionPreference = 'Stop'
$petDockRoot = $PSScriptRoot
$petDockPackaged = Join-Path $petDockRoot 'dist\Ogle-win32-x64\Ogle.exe'
$petDockDevelopment = Join-Path $petDockRoot 'node_modules\electron\dist\electron.exe'
if (Test-Path -LiteralPath $petDockPackaged) {
    Start-Process -FilePath $petDockPackaged -WorkingDirectory $petDockRoot -WindowStyle Hidden
} elseif (Test-Path -LiteralPath $petDockDevelopment) {
    Start-Process -FilePath $petDockDevelopment -ArgumentList ('"' + $petDockRoot + '"') -WorkingDirectory $petDockRoot -WindowStyle Hidden
} else {
    throw 'Install dependencies first: run npm ci in the Ogle folder.'
}
