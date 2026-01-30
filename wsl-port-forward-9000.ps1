# Script đơn giản để forward port 9000 từ Windows sang WSL2
# Chạy script này trong Windows PowerShell (không phải WSL2) với quyền Administrator

# Lấy WSL2 IP tự động
$wslIp = (wsl hostname -I).Trim()

Write-Host "🚀 Configuring port forwarding for Socket.IO (port 9000)..." -ForegroundColor Cyan
Write-Host "WSL2 IP: $wslIp" -ForegroundColor Yellow
Write-Host ""

# Port 9000 cho Socket.IO
$port = 9000

Write-Host "⚙️  Configuring port $port..." -ForegroundColor Green

# Remove existing forwarding if any
netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null

# Add new port forwarding
netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wslIp

# Add firewall rule
netsh advfirewall firewall delete rule name="WSL2 Port $port" 2>$null
netsh advfirewall firewall add rule name="WSL2 Port $port" dir=in action=allow protocol=TCP localport=$port

Write-Host "   ✅ Port $port forwarded" -ForegroundColor Green

Write-Host ""
Write-Host "📋 Current port forwarding rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

Write-Host ""
Write-Host "🎉 Done! Socket.IO port 9000 is now accessible from network." -ForegroundColor Green
Write-Host ""
Write-Host "💡 Lưu ý: WSL2 IP có thể thay đổi sau mỗi lần restart WSL2." -ForegroundColor Yellow
Write-Host "   Nếu IP thay đổi, chạy lại script này." -ForegroundColor Yellow


