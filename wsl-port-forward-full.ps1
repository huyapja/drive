# Script to forward ports from Windows to WSL2
# Run this in PowerShell as Administrator

$wslIp = "172.22.163.122"
$ports = @(8001, 8080, 9000)

Write-Host "🚀 Configuring port forwarding for WSL2..." -ForegroundColor Cyan
Write-Host "WSL2 IP: $wslIp" -ForegroundColor Yellow
Write-Host ""

foreach ($port in $ports) {
    Write-Host "⚙️  Configuring port $port..." -ForegroundColor Green
    
    # Remove existing forwarding if any
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
    
    # Add new port forwarding
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp
    
    # Add firewall rule
    netsh advfirewall firewall delete rule name="WSL2 Port $port" 2>$null
    netsh advfirewall firewall add rule name="WSL2 Port $port" dir=in action=allow protocol=TCP localport=$port
    
    Write-Host "   ✅ Port $port forwarded" -ForegroundColor Green
}

Write-Host ""
Write-Host "📋 Current port forwarding rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "🎉 Done! Port forwarding configured." -ForegroundColor Green
Write-Host ""
Write-Host "📱 To access from your phone:" -ForegroundColor Yellow
Write-Host "   1. Find your Windows IP: ipconfig" -ForegroundColor White
Write-Host "   2. Access frontend: http://YOUR_WINDOWS_IP:8080" -ForegroundColor White
Write-Host "   3. Backend API: http://YOUR_WINDOWS_IP:8001" -ForegroundColor White
Write-Host ""
Write-Host "💡 To remove port forwarding later:" -ForegroundColor Yellow
Write-Host "   netsh interface portproxy reset" -ForegroundColor White
