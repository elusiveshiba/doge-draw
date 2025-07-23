import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Pixel coordinate utilities
export function getPixelKey(x: number, y: number): string {
  return `${x}-${y}`
}

export function parsePixelKey(key: string): { x: number; y: number } {
  const [x, y] = key.split('-').map(Number)
  return { x, y }
}

// Color utilities
export function isValidHexColor(color: string): boolean {
  return /^#[0-9A-F]{6}$/i.test(color)
}

export function formatCredits(credits: number): string {
  return credits.toLocaleString()
}

export function formatDoge(amount: number): string {
  return amount.toFixed(5) + ' DOGE'
}

// Price calculation
export function calculateNewPixelPrice(currentPrice: number, multiplier: number): number {
  return Math.ceil(currentPrice * multiplier)
}

// Wallet address validation (simplified)
export function isValidDogeAddress(address: string): boolean {
  // Basic validation - in production, use a proper Dogecoin address validator
  return address.length >= 25 && address.length <= 34 && /^[A-Za-z0-9]+$/.test(address)
} 