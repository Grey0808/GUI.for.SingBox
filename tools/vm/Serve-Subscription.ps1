param(
    [string]$FixtureDirectory = $PSScriptRoot,
    [ValidateRange(0, 65535)][int]$Port = 0,
    [ValidateRange(0, 10000)][int]$RequestLimit = 0
)
$ErrorActionPreference = 'Stop'
$routes = @{
    '/xray.json' = @('xray-mixed.json', 'application/json')
    '/sing-box.json' = @('sing-box-existing.json', 'application/json')
    '/clash.yaml' = @('clash.yaml', 'text/yaml')
    '/base64' = @('base64.txt', 'text/plain')
}
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$count = 0
try {
    Write-Output ('Fixture URL: http://127.0.0.1:' + $listener.LocalEndpoint.Port + '/xray.json')
    Write-Output ('Failure URL: http://127.0.0.1:' + $listener.LocalEndpoint.Port + '/error')
    Write-Output 'Loopback only; no upstream requests, GUI, kernel or system changes. Ctrl+C closes this listener.'
    while ($RequestLimit -eq 0 -or $count -lt $RequestLimit) {
        $client = $listener.AcceptTcpClient()
        try {
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $request = $reader.ReadLine()
            while ($null -ne ($line = $reader.ReadLine()) -and $line -ne '') { }
            $reader.Dispose()
            $parts = $request -split ' '
            $status = '503 Service Unavailable'
            $contentType = 'text/plain'
            $body = [System.Text.Encoding]::UTF8.GetBytes('Fixture unavailable')
            if ($parts.Count -ge 2 -and $parts[0] -eq 'GET' -and $routes.ContainsKey($parts[1])) {
                $route = $routes[$parts[1]]
                $body = [System.IO.File]::ReadAllBytes((Join-Path $FixtureDirectory $route[0]))
                $contentType = $route[1]
                $status = '200 OK'
            }
            $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n"
            if ($status -eq '200 OK') {
                $headers += "Subscription-Userinfo: upload=1; download=2; total=100; expire=2000000000`r`nProfile-Title: Local acceptance fixture`r`nProfile-Update-Interval: 24`r`nSupport-Url: https://support.example.invalid`r`nAnnounce: Anonymized local fixture`r`n"
            }
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers + "`r`n")
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        } finally { $client.Dispose(); $count++ }
    }
} finally { $listener.Stop() }
