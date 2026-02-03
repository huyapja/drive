/**
 * Generate UUID v4
 * Polyfill for crypto.randomUUID() để tương thích với các môi trường không hỗ trợ
 * @returns UUID v4 string
 */
export function generateUUID(): string {
  // Sử dụng crypto.randomUUID() nếu có
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  // Fallback: tự implement UUID v4
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Alias cho generateUUID() để dễ sử dụng
 */
export const randomUUID = generateUUID


