# Hướng dẫn Forward Port 9000 cho Socket.IO

## Vấn đề
Khi truy cập ứng dụng qua IP từ mạng local (ví dụ: `http://192.168.100.236:8081`), WebSocket không kết nối được vì port 9000 chưa được forward từ Windows sang WSL2.

## Giải pháp

### Cách 1: Chạy script PowerShell (Khuyến nghị)

1. **Mở Windows PowerShell với quyền Administrator** (không phải WSL2):
   - Nhấn `Win + X`
   - Chọn "Windows PowerShell (Admin)" hoặc "Terminal (Admin)"

2. **Chuyển đến thư mục project**:
   ```powershell
   cd C:\Users\YourUsername\path\to\hainamtech\apps\drive
   ```

3. **Chạy script**:
   ```powershell
   .\wsl-port-forward-9000.ps1
   ```

   Hoặc nếu bị chặn execution policy:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\wsl-port-forward-9000.ps1
   ```

### Cách 2: Chạy lệnh thủ công

Mở **Windows PowerShell với quyền Administrator** và chạy:

```powershell
# Lấy WSL2 IP tự động
$wslIp = (wsl hostname -I).Trim()
Write-Host "WSL2 IP: $wslIp"

# Forward port 9000
netsh interface portproxy add v4tov4 listenport=9000 listenaddress=0.0.0.0 connectport=9000 connectaddress=$wslIp

# Thêm firewall rule
netsh advfirewall firewall add rule name="WSL2 Port 9000" dir=in action=allow protocol=TCP localport=9000

# Kiểm tra
netsh interface portproxy show v4tov4
```

### Cách 3: Sử dụng WSL IP cố định

Nếu WSL2 IP của bạn là `172.22.163.122` (kiểm tra bằng `hostname -I` trong WSL2):

```powershell
netsh interface portproxy add v4tov4 listenport=9000 listenaddress=0.0.0.0 connectport=9000 connectaddress=172.22.163.122
netsh advfirewall firewall add rule name="WSL2 Port 9000" dir=in action=allow protocol=TCP localport=9000
```

## Kiểm tra

Sau khi chạy script, kiểm tra:

1. **Xem port forwarding rules**:
   ```powershell
   netsh interface portproxy show v4tov4
   ```

2. **Test kết nối từ WSL2**:
   ```bash
   curl -v "http://192.168.100.236:9000/socket.io/?EIO=4&transport=polling"
   ```

3. **Truy cập ứng dụng qua IP** và kiểm tra WebSocket trong browser console.

## Lưu ý

- **WSL2 IP có thể thay đổi** sau mỗi lần restart WSL2
- Nếu IP thay đổi, cần chạy lại script
- Để tự động forward port khi WSL2 start, có thể tạo task scheduler hoặc startup script

## Xóa port forwarding

Nếu cần xóa port forwarding:

```powershell
netsh interface portproxy delete v4tov4 listenport=9000 listenaddress=0.0.0.0
netsh advfirewall firewall delete rule name="WSL2 Port 9000"
```


