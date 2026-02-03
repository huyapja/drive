import { io, Socket } from "socket.io-client"
// @ts-ignore - JSON import
import { socketio_port } from "../../../../sites/common_site_config.json"

// Type definitions cho window extensions
declare global {
  interface Window {
    frappe?: {
      boot?: {
        site_name?: string
        sitename?: string
        [key: string]: any
      }
      [key: string]: any
    }
    site_name?: string
  }
}

function getCookie(name: string): string | undefined {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()!.split(";").shift()
  return undefined
}

/**
 * Test kết nối đến Socket.IO server trước khi khởi tạo socket
 * @param url URL của Socket.IO server
 * @returns Promise<boolean> true nếu server accessible
 */
async function testSocketConnection(url: string): Promise<boolean> {
  try {
    const testUrl = `${url}/socket.io/?EIO=4&transport=polling`
    const response = await fetch(testUrl, {
      method: "GET",
      mode: "cors",
      credentials: "include",
      cache: "no-cache",
    })
    
    console.log("🔍 Test connection result:", {
      url: testUrl,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    })
    
    return response.ok || response.status === 200
  } catch (error: any) {
    console.warn("⚠️ Test connection failed:", error?.message || error)
    return false
  }
}

export function initSocket(): Socket {
  const host = window.location.hostname
  const isHttps = window.location.protocol === "https:"
  const protocol = isHttps ? "https" : "http"
  const port = socketio_port || 9000

  // Lấy site name với nhiều fallback options
  // Ưu tiên: window.frappe.boot, sau đó window.site_name, cuối cùng là cookie
  const site =
    window?.frappe?.boot?.site_name ||
    window?.frappe?.boot?.sitename ||
    (window as any)?.site_name ||
    getCookie("site_name") ||
    ""

  // Xây dựng URL: sử dụng cùng hostname nhưng với port của socket.io
  // Nếu là HTTPS, không cần port (thường dùng reverse proxy)
  // Nếu là HTTP, dùng port từ config
  // Luôn thêm site name vào URL nếu có
  let url: string
  if (isHttps) {
    url = site ? `${protocol}://${host}/${site}` : `${protocol}://${host}`
  } else {
    url = site ? `${protocol}://${host}:${port}/${site}` : `${protocol}://${host}:${port}`
  }

  console.log("🔗 Socket URL:", url)
  console.log("🔍 Debug info:", {
    host,
    protocol,
    port,
    site: site || "(empty)",
    isHttps,
    windowLocation: window.location.href,
    frappeBoot: window?.frappe?.boot ? "exists" : "missing",
    origin: window.location.origin,
  })
  
  // Cảnh báo nếu site name không có
  if (!site) {
    console.warn("⚠️ Site name không được tìm thấy! WebSocket có thể không hoạt động.")
    console.warn("   Kiểm tra: window.frappe.boot.site_name hoặc window.site_name")
  }

  // Test kết nối trước (chỉ trong dev mode hoặc khi cần debug)
  // Sử dụng window.location.hostname để detect dev mode (localhost hoặc IP)
  const isDevMode = host === "localhost" || host === "127.0.0.1" || /^192\.168\./.test(host) || /^10\./.test(host)
  if (isDevMode) {
    testSocketConnection(url).then((accessible) => {
      if (!accessible) {
        console.warn("⚠️ Socket.IO server có thể không accessible từ URL này")
        console.warn("   Hãy kiểm tra:")
        console.warn("   1. Server có đang chạy không?")
        console.warn("   2. Server có bind đúng interface (0.0.0.0) không?")
        console.warn("   3. Firewall có chặn port 9000 không?")
      }
    })
  }

  // Cấu hình socket với các options để xử lý tốt hơn khi truy cập qua IP
  // Thêm header x-frappe-site-name để server có thể lấy đúng site name
  const extraHeaders: Record<string, string> = {}
  if (site) {
    extraHeaders["x-frappe-site-name"] = site
  }

  const socket = io(url, {
    path: "/socket.io",
    // Thử polling trước nếu websocket fail (thường ổn định hơn với IP)
    transports: ["polling", "websocket"],
    // Cho phép upgrade từ polling sang websocket nếu có thể
    upgrade: true,
    // Force new connection để tránh cache issues
    forceNew: false,
    withCredentials: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: true,
    // Thêm header để server biết site name (quan trọng khi truy cập qua IP)
    extraHeaders: extraHeaders,
  })

  socket.on("connect", () => {
    console.log("✅ THÀNH CÔNG! WebSocket connected:", socket.id)
  })

  socket.on("connect_error", (error: any) => {
    console.error("❌ Lỗi kết nối WebSocket:", error)
    console.error("❌ URL đã thử:", url)
    
    // Extract thông tin từ XMLHttpRequest nếu có
    const xhr = error?.context
    let xhrInfo: any = {}
    if (xhr && xhr instanceof XMLHttpRequest) {
      xhrInfo = {
        status: xhr.status,
        statusText: xhr.statusText,
        responseURL: xhr.responseURL,
        readyState: xhr.readyState,
        responseText: xhr.responseText?.substring(0, 200) || "No response",
      }
    }
    
    console.error("❌ Chi tiết lỗi:", {
      message: error?.message || "Unknown error",
      description: error?.description || "No description",
      type: error?.type || "Unknown type",
      data: error?.data || "No data",
      xhrInfo: Object.keys(xhrInfo).length > 0 ? xhrInfo : "No XHR info",
    })
    
    // Log thêm thông tin về transport đang được sử dụng
    console.error("🔍 Transport info:", {
      transport: socket.io?.engine?.transport?.name || "unknown",
      readyState: socket.io?.engine?.readyState || "unknown",
    })
    
    // Gợi ý khắc phục dựa trên loại lỗi
    if (error?.type === "TransportError") {
      console.warn("💡 Gợi ý: Lỗi TransportError thường do:")
      
      if (xhrInfo.status === 0) {
        console.warn("   → Status 0: Không thể kết nối đến server")
        console.warn("     - Server Socket.IO có thể không chạy")
        console.warn("     - Hoặc server chỉ bind localhost (127.0.0.1) thay vì 0.0.0.0")
        console.warn("     - Kiểm tra: netstat -tuln | grep 9000")
      } else if (xhrInfo.status === 404) {
        console.warn("   → Status 404: Endpoint không tồn tại")
        console.warn("     - Kiểm tra path: /socket.io có đúng không?")
        console.warn("     - Kiểm tra site name trong URL có đúng không?")
      } else if (xhrInfo.status === 403 || xhrInfo.status === 401) {
        console.warn("   → Status " + xhrInfo.status + ": Lỗi authentication/authorization")
        console.warn("     - Có thể do Origin validation fail")
        console.warn("     - Hoặc cookie/session không được gửi đúng")
      } else if (xhrInfo.status >= 500) {
        console.warn("   → Status " + xhrInfo.status + ": Lỗi server")
        console.warn("     - Server Socket.IO có lỗi internal")
      } else {
        console.warn("   1. Port 9000 không accessible từ IP này")
        console.warn("   2. Firewall đang chặn kết nối")
        console.warn("   3. Server Socket.IO không chạy hoặc không bind đúng interface")
        console.warn("   4. Origin/Hostname validation fail trên server")
      }
      
      console.warn("   → Hãy kiểm tra:")
      console.warn("     - Socket.IO server: ps aux | grep socketio")
      console.warn("     - Port listening: netstat -tuln | grep 9000")
      console.warn("     - Firewall: sudo ufw status hoặc iptables -L")
      console.warn("     - Test connection: curl -v http://192.168.100.236:9000/socket.io/?EIO=4&transport=polling")
    }
  })
  
  // Log khi transport thay đổi
  socket.io?.engine?.on("upgrade", () => {
    console.log("🔄 Transport upgraded to:", socket.io?.engine?.transport?.name)
  })
  
  socket.io?.engine?.on("upgradeError", (error: any) => {
    console.warn("⚠️ Upgrade error (falling back to polling):", error)
  })

  socket.on("disconnect", (reason) => {
    console.warn("⚠️ WebSocket đã ngắt kết nối:", reason)
  })

  return socket
}


export class RealTimeHandler {
  open_docs: Set<string>
  socket: Socket
  subscribing: boolean

  constructor(socket) {
    this.open_docs = new Set()
    this.socket = socket
    this.subscribing = false
  }

  on(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }

  emit(event: string, ...args: any[]) {
    this.socket.emit(event, ...args)
  }

  doc_subscribe(doctype: string, docname: string) {
    if (this.subscribing) {
      console.log("throttled")
      return
    }
    if (this.open_docs.has(`${doctype}:${docname}`)) {
      return
    }

    this.subscribing = true

    // throttle to 1 per sec
    setTimeout(() => {
      this.subscribing = false
    }, 1000)

    this.emit("doc_subscribe", doctype, docname)
    this.open_docs.add(`${doctype}:${docname}`)
  }
  doc_unsubscribe(doctype: string, docname: string) {
    this.emit("doc_unsubscribe", doctype, docname)
    return this.open_docs.delete(`${doctype}:${docname}`)
  }
  doc_open(doctype: string, docname: string) {
    this.emit("doc_open", doctype, docname)
  }
  doc_close(doctype: string, docname: string) {
    this.emit("doc_close", doctype, docname)
  }
  publish(event: string, message: any) {
    if (this.socket) {
      this.emit(event, message)
    }
  }
}
