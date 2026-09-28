<#
  Preview the site on this computer, the way the web host will serve it.

  Double-click PREVIEW.cmd (in the pn0va-site folder) rather than running
  this directly. Nothing to install: PowerShell comes with Windows.

  The same server as tools/preview.py, for Windows without Python; keep the
  two in step. It reads the build's own .htaccess and follows it the way
  Apache does:

    * /drops is served from drops/index.html, and /drops/ redirects to /drops;
    * old addresses (/drops.html, /geocache.html, /shop ...) redirect;
    * a missing page shows the home page, with a 404 status.

  It also answers range requests (the Drops map reads its file in pieces)
  and tells the browser to cache nothing, so a rebuild shows on the next
  reload. Only this computer can open it.

  Written for Windows PowerShell 5.1, so: plain ASCII (5.1 reads a file
  without a byte-order mark as the local code page), no newer syntax.
#>
param(
  [string]$Folder = '',
  [int]$Port = 8940,
  [switch]$NoBrowser,
  [Parameter(ValueFromRemainingArguments = $true)] $Rest
)

$ErrorActionPreference = 'Stop'
$Site = Split-Path -Parent $PSScriptRoot

$Known = [ordered]@{                        # build folder -> what it is
  'with-store-clean' = 'upload-ready, with the store'
  'no-store-clean'   = 'upload-ready, without the store'
  'with-store'       = 'flat copy, with the store'
  'no-store'         = 'flat copy, without the store'
}

$Types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json'
  '.txt' = 'text/plain; charset=utf-8'; '.xml' = 'application/xml'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'; '.webp' = 'image/webp'
  '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'
  '.ttf' = 'font/ttf'; '.pdf' = 'application/pdf'
  '.webmanifest' = 'application/manifest+json'
  '.pmtiles' = 'application/octet-stream'
}

function Stop-WithMessage([string]$text) {
  Write-Host ''
  Write-Host "  $text" -ForegroundColor Red
  exit 1
}


# ------------------------------------------------------------- picking ---
function Get-Sites([string]$base) {
  # folders in $base with an index.html, the four builds first
  $order = @($Known.Keys)
  $found = @(foreach ($d in [IO.Directory]::GetDirectories($base)) {
    if ([IO.File]::Exists([IO.Path]::Combine($d, 'index.html'))) { $d }
  })
  $found | Sort-Object @{ Expression = {
      $i = [array]::IndexOf($order, [IO.Path]::GetFileName($_))
      if ($i -lt 0) { $order.Count } else { $i } } },
    @{ Expression = { [IO.Path]::GetFileName($_).ToLowerInvariant() } }
}

function Select-Site {
  $base = $Site
  if ($Folder) {
    $p = $Folder
    if (-not [IO.Directory]::Exists($p) -and [IO.Directory]::Exists([IO.Path]::Combine($Site, $Folder))) {
      $p = [IO.Path]::Combine($Site, $Folder)
    }
    if (-not [IO.Directory]::Exists($p)) { Stop-WithMessage "There is no folder called $Folder." }
    if ([IO.File]::Exists([IO.Path]::Combine($p, 'index.html'))) { return $p }
    $base = $p                              # a folder of builds: choose below
  }
  $found = @(Get-Sites $base)
  if ($found.Count -eq 0) {
    Stop-WithMessage ("No site folder in $base.`n  Run build.py first, or drag a folder " +
                      "that has an index.html in it onto PREVIEW.cmd.")
  }
  if ($found.Count -eq 1) { return $found[0] }
  Write-Host ''
  Write-Host '  Which build?'
  Write-Host ''
  for ($i = 0; $i -lt $found.Count; $i++) {
    $name = [IO.Path]::GetFileName($found[$i])
    $what = ''
    if ($Known.Contains($name)) { $what = $Known[$name] }
    $row = '    {0}  {1,-18} {2}' -f ($i + 1), $name, $what
    Write-Host $row.TrimEnd()
  }
  while ($true) {
    Write-Host ''
    $answer = "$(Read-Host '  Type a number and press Enter (just Enter for 1)')".Trim()
    if (-not $answer) { return $found[0] }
    $n = 0
    if ([int]::TryParse($answer, [ref]$n) -and $n -ge 1 -and $n -le $found.Count) {
      return $found[$n - 1]
    }
  }
}


# ------------------------------------------------------------ the site ---
function Read-Rules([string]$root) {
  # the old-address redirects and the missing-page rule from .htaccess
  $rules = @{ Redirects = @(); NotFound = $null }
  $file = [IO.Path]::Combine($root, '.htaccess')
  if ([IO.File]::Exists($file)) {
    foreach ($line in [IO.File]::ReadAllLines($file)) {
      $m = [regex]::Match($line, '^\s*RewriteRule\s+(\S+)\s+(/\S*)\s+\[R=301,L\]')
      if ($m.Success) {
        $rules.Redirects += [pscustomobject]@{ Rx = [regex]$m.Groups[1].Value; To = $m.Groups[2].Value }
      }
      $m = [regex]::Match($line, '^\s*ErrorDocument\s+404\s+(/\S*)')
      if ($m.Success) { $rules.NotFound = $m.Groups[1].Value }
    }
  }
  $rules
}

function Resolve-Target([string]$path) {
  # @{Kind='file'; File=...}, @{Kind='redirect'; To=...} or @{Kind='missing'},
  # in Apache's order
  $rel = $path.TrimStart('/')
  if ($rel.IndexOf([char]0) -ge 0) { return @{ Kind = 'missing' } }
  # dot files (.htaccess) are never served; this also refuses ".."
  foreach ($part in ($rel -split '[\\/]')) {
    if ($part.StartsWith('.')) { return @{ Kind = 'missing' } }
  }
  try { $full = [IO.Path]::GetFullPath([IO.Path]::Combine($Root, $rel)).TrimEnd('\', '/') }
  catch { return @{ Kind = 'missing' } }
  if ($full -ne $Root -and
      -not $full.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    return @{ Kind = 'missing' }
  }
  $isDir = [IO.Directory]::Exists($full)
  # /drops/ -> /drops
  if ($path -ne '/' -and $path.EndsWith('/') -and $isDir) {
    $to = $path.TrimEnd('/')
    if (-not $to) { $to = '/' }
    return @{ Kind = 'redirect'; To = $to }
  }
  # /drops -> drops/index.html
  $index = [IO.Path]::Combine($full, 'index.html')
  if ($isDir -and [IO.File]::Exists($index)) { return @{ Kind = 'file'; File = $index } }
  # old addresses. Apache applies these before looking for the file.
  foreach ($r in $Rules.Redirects) {
    if ($r.Rx.IsMatch($rel)) { return @{ Kind = 'redirect'; To = $r.To } }
  }
  if ([IO.File]::Exists($full)) { return @{ Kind = 'file'; File = $full } }
  @{ Kind = 'missing' }
}

function Get-ByteRange([string]$header, [long]$size) {
  # @{Start; End} for a Range header, @{Bad=$true} if it asks for nothing
  # the file has, or $null to send it all
  $m = [regex]::Match($header, '^\s*bytes\s*=\s*([0-9]*)\s*-\s*([0-9]*)\s*$')
  if (-not $m.Success) { return $null }     # several ranges, or not bytes
  $a = $m.Groups[1].Value
  $b = $m.Groups[2].Value
  if (-not ($a -or $b)) { return $null }
  try {
    if (-not $a) {                          # bytes=-500: the last 500
      $n = [long]$b
      if ($n -eq 0 -or $size -eq 0) { return @{ Bad = $true } }
      return @{ Start = [Math]::Max($size - $n, [long]0); End = $size - 1 }
    }
    $start = [long]$a
    if ($b -and [long]$b -lt $start) { return $null }   # malformed: ignore it, as the spec says
    if ($start -ge $size) { return @{ Bad = $true } }
    $end = $size - 1
    if ($b) { $end = [Math]::Min([long]$b, $size - 1) }
    return @{ Start = $start; End = $end }
  }
  catch { return $null }                    # a number too big to read
}


# ------------------------------------------------------------- serving ---
function Write-Note($req, [int]$status, [string]$extra = '') {
  Write-Host ('  {0}  {1}{2}' -f $status, [Uri]::UnescapeDataString($req.RawUrl), $extra)
}

function Send-Text($ctx, [int]$status, [string]$text, [hashtable]$headers = @{}) {
  $res = $ctx.Response
  $res.StatusCode = $status
  $res.ContentType = 'text/plain; charset=utf-8'
  foreach ($k in $headers.Keys) { $res.AddHeader($k, $headers[$k]) }
  $res.AddHeader('Cache-Control', 'no-store')
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $res.ContentLength64 = $bytes.Length
  if ($ctx.Request.HttpMethod -ne 'HEAD' -and $bytes.Length) {
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  }
}

function Send-File($ctx, [string]$file, [int]$status) {
  $req = $ctx.Request
  $res = $ctx.Response
  $size = (New-Object IO.FileInfo $file).Length
  $start = [long]0
  $end = $size - 1
  $range = $req.Headers['Range']
  if ($status -eq 200 -and $range) {
    $r = Get-ByteRange $range $size
    if ($r -and $r.Bad) {
      Write-Note $req 416
      Send-Text $ctx 416 '' @{ 'Content-Range' = "bytes */$size" }
      return
    }
    if ($r) { $start = $r.Start; $end = $r.End; $status = 206 }
  }
  $type = $Types[[IO.Path]::GetExtension($file).ToLowerInvariant()]
  if (-not $type) { $type = 'application/octet-stream' }
  if ($status -eq 200 -and $type.StartsWith('text/html')) { Write-Note $req 200 }
  $res.StatusCode = $status
  $res.ContentType = $type
  $res.AddHeader('Accept-Ranges', 'bytes')
  if ($status -eq 206) { $res.AddHeader('Content-Range', "bytes $start-$end/$size") }
  # cache nothing, so a rebuild shows at once. This covers the 301s too:
  # a browser keeps a cached 301 for good, and the flat builds, if
  # previewed at this address later, have no /drops to be sent to.
  $res.AddHeader('Cache-Control', 'no-store')
  $res.AddHeader('X-Content-Type-Options', 'nosniff')     # as the host sends
  $res.ContentLength64 = $end - $start + 1
  if ($req.HttpMethod -eq 'HEAD') { return }
  # share read, write and delete, so build.py can wipe the folder meanwhile
  $fs = New-Object IO.FileStream($file, [IO.FileMode]::Open, [IO.FileAccess]::Read,
                                 ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  try {
    [void]$fs.Seek($start, [IO.SeekOrigin]::Begin)
    $buf = New-Object byte[] 65536
    $left = $end - $start + 1
    while ($left -gt 0) {
      $n = $fs.Read($buf, 0, [int][Math]::Min([long]$buf.Length, $left))
      if ($n -le 0) { break }
      $res.OutputStream.Write($buf, 0, $n)
      $left -= $n
    }
  }
  finally { $fs.Dispose() }
}

function Invoke-Request($ctx) {
  $req = $ctx.Request
  if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
    Send-Text $ctx 405 "Only GET and HEAD`n" @{ 'Allow' = 'GET, HEAD' }
    return
  }
  $raw = $req.RawUrl
  $query = ''
  $q = $raw.IndexOf('?')
  if ($q -ge 0) { $query = $raw.Substring($q); $raw = $raw.Substring(0, $q) }
  # one leading slash: a redirect to //drops would send the browser to a
  # host called "drops"
  $path = '/' + [Uri]::UnescapeDataString($raw).TrimStart('/')
  $t = Resolve-Target $path
  if ($t.Kind -eq 'redirect') {
    Write-Note $req 301 "  -> $($t.To)$query"
    Send-Text $ctx 301 '' @{ 'Location' = $t.To + $query }
    return
  }
  if ($t.Kind -eq 'file') { Send-File $ctx $t.File 200; return }
  # ErrorDocument 404 / : the host shows the home page, status 404
  $page = @{ Kind = 'missing' }
  if ($Rules.NotFound) { $page = Resolve-Target $Rules.NotFound }
  if ($page.Kind -eq 'file') {
    Write-Note $req 404 '  (shows the home page, as the host will)'
    Send-File $ctx $page.File 404
  }
  else {
    Write-Note $req 404
    Send-Text $ctx 404 "Not found`n"
  }
}

function Start-Listener([int]$first) {
  # a few ports up from the usual one, then any free port: Windows reserves
  # blocks of ports for Hyper-V and WSL, sometimes right where 8940 is
  $ports = @($first..($first + 19))
  for ($k = 0; $k -lt 5; $k++) { $ports += 0 }
  $why = ''
  foreach ($p in $ports) {
    if ($p -eq 0) {
      $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
      $probe.Start()
      $p = $probe.LocalEndpoint.Port
      $probe.Stop()
    }
    $l = New-Object Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    try { $l.Start(); return @{ Listener = $l; Port = $p } }
    catch { $why = $_.Exception.Message; $l.Close() }
  }
  @{ Error = $why }
}

function Set-ConsoleLive {
  # Clicking in an old-style console window starts a text selection, and
  # while it lasts Windows freezes anything the window prints: the server
  # would hang on its next log line. Switch that off for this window.
  try {
    Add-Type -Namespace Pn0va -Name ConsoleMode -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int handle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr handle, out int mode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr handle, int mode);
'@
    $h = [Pn0va.ConsoleMode]::GetStdHandle(-10)            # standard input
    $mode = 0
    if ([Pn0va.ConsoleMode]::GetConsoleMode($h, [ref]$mode)) {
      # clear QUICK_EDIT (0x40); EXTENDED_FLAGS (0x80) makes that stick
      [void][Pn0va.ConsoleMode]::SetConsoleMode($h, ($mode -band (-bnot 0x40)) -bor 0x80)
    }
  }
  catch { }
}


$Root = [IO.Path]::GetFullPath((Select-Site)).TrimEnd('\', '/')
$Rules = Read-Rules $Root
$name = [IO.Path]::GetFileName($Root)

$started = Start-Listener $Port
if (-not $started.Listener) { Stop-WithMessage "Could not start the preview server: $($started.Error)" }
$listener = $started.Listener
$url = "http://localhost:$($started.Port)"
try { $Host.UI.RawUI.WindowTitle = "Preview: $name - $url" } catch { }

Write-Host ''
Write-Host "  Previewing $name at $url" -ForegroundColor Green
Write-Host ''
Write-Host "  Your browser should open on its own. If it doesn't, type that address"
Write-Host "  into it. Leave this window open while you look around; close it to stop."
Write-Host ''
if (-not $NoBrowser) { try { Start-Process "$url/" } catch { } }
Set-ConsoleLive

try {
  while ($listener.IsListening) {
    $task = $listener.GetContextAsync()
    while (-not $task.Wait(250)) { }        # short waits, so Ctrl+C gets through
    $ctx = $task.Result
    try { Invoke-Request $ctx }
    catch {
      $e = $_.Exception
      while ($e.InnerException) { $e = $e.InnerException }
      # a browser giving up on a request (the map does, when you zoom past
      # a tile) and a file vanishing mid-rebuild are normal; say anything else
      if (-not ($e -is [Net.HttpListenerException] -or $e -is [IO.IOException] -or
                $e -is [ObjectDisposedException])) {
        Write-Host "  error: $($e.Message)" -ForegroundColor Yellow
        try { $ctx.Response.StatusCode = 500 } catch { }
      }
    }
    finally { try { $ctx.Response.Close() } catch { } }
  }
}
finally { $listener.Close() }
