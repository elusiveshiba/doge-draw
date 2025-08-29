/**
 * Mobile synchronization utilities for handling reconnection after backgrounding
 * Helps detect when the app needs to refresh board state after being inactive
 */

export interface MobileSyncState {
  lastActiveTimestamp: number;
  lastBoardUpdateTimestamp: number;
  isInBackground: boolean;
  hasStaleConnection: boolean;
}

export class MobileSync {
  private static instance: MobileSync;
  private syncState: MobileSyncState;
  private visibilityChangeHandler?: () => void;
  private heartbeatInterval?: NodeJS.Timeout;
  private onSyncRequiredCallback?: () => void;

  private constructor() {
    this.syncState = {
      lastActiveTimestamp: Date.now(),
      lastBoardUpdateTimestamp: Date.now(),
      isInBackground: false,
      hasStaleConnection: false
    };
  }

  static getInstance(): MobileSync {
    if (!MobileSync.instance) {
      MobileSync.instance = new MobileSync();
    }
    return MobileSync.instance;
  }

  /**
   * Initialize mobile sync tracking
   */
  initialize(onSyncRequired?: () => void): void {
    if (typeof window === 'undefined') return;

    this.onSyncRequiredCallback = onSyncRequired;

    // Set up visibility change detection
    this.setupVisibilityTracking();
    
    // Set up periodic heartbeat
    this.setupHeartbeat();

    // Set up beforeunload cleanup
    window.addEventListener('beforeunload', this.cleanup.bind(this));
  }

  /**
   * Set up page visibility tracking to detect backgrounding
   */
  private setupVisibilityTracking(): void {
    if (typeof document === 'undefined') return;

    this.visibilityChangeHandler = () => {
      const now = Date.now();

      if (document.hidden) {
        // App went to background
        console.log('🔄 App backgrounded at:', new Date(now).toISOString());
        this.syncState.isInBackground = true;
        this.syncState.lastActiveTimestamp = now;
        this.stopHeartbeat();
      } else {
        // App came to foreground
        const backgroundDuration = now - this.syncState.lastActiveTimestamp;
        console.log('🔄 App foregrounded after:', backgroundDuration + 'ms');
        
        this.syncState.isInBackground = false;
        this.syncState.lastActiveTimestamp = now;
        
        // Check if we need to sync due to being backgrounded for too long
        const STALE_THRESHOLD = 30000; // 30 seconds
        if (backgroundDuration > STALE_THRESHOLD) {
          console.log('🔄 Stale connection detected, triggering sync');
          this.syncState.hasStaleConnection = true;
          this.onSyncRequiredCallback?.();
        }
        
        this.setupHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // Also track focus/blur for additional detection
    window.addEventListener('focus', () => {
      if (this.syncState.isInBackground) {
        this.visibilityChangeHandler?.();
      }
    });

    window.addEventListener('blur', () => {
      if (!this.syncState.isInBackground) {
        this.syncState.isInBackground = true;
        this.syncState.lastActiveTimestamp = Date.now();
        this.stopHeartbeat();
      }
    });
  }

  /**
   * Set up periodic heartbeat to track activity
   */
  private setupHeartbeat(): void {
    this.stopHeartbeat(); // Clear existing interval

    // Send heartbeat every 10 seconds when active
    this.heartbeatInterval = setInterval(() => {
      if (!this.syncState.isInBackground) {
        this.syncState.lastActiveTimestamp = Date.now();
        // This will be used by the WebSocket client to send heartbeat
      }
    }, 10000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  /**
   * Update the last known board update timestamp
   */
  updateBoardTimestamp(timestamp: number = Date.now()): void {
    this.syncState.lastBoardUpdateTimestamp = timestamp;
    this.syncState.hasStaleConnection = false; // Reset stale flag
  }

  /**
   * Get the current sync state
   */
  getSyncState(): MobileSyncState {
    return { ...this.syncState };
  }

  /**
   * Check if a sync is needed based on current state
   */
  needsSync(): boolean {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.syncState.lastBoardUpdateTimestamp;
    const timeSinceLastActive = now - this.syncState.lastActiveTimestamp;
    
    return (
      this.syncState.hasStaleConnection ||
      timeSinceLastUpdate > 60000 || // No updates for 1 minute
      (this.syncState.isInBackground && timeSinceLastActive > 30000) // Background for 30+ seconds
    );
  }

  /**
   * Get data to send with WebSocket join-board event
   */
  getJoinBoardData(boardId: string, userId?: string): {
    boardId: string;
    userId?: string;
    lastUpdateTimestamp: number;
  } {
    return {
      boardId,
      userId,
      lastUpdateTimestamp: this.syncState.lastBoardUpdateTimestamp
    };
  }

  /**
   * Get data to send with heartbeat
   */
  getHeartbeatData(boardId: string): {
    boardId: string;
    timestamp: number;
  } {
    return {
      boardId,
      timestamp: Date.now()
    };
  }

  /**
   * Mark that a sync has been completed
   */
  markSyncCompleted(): void {
    this.syncState.hasStaleConnection = false;
    this.syncState.lastBoardUpdateTimestamp = Date.now();
    this.syncState.lastActiveTimestamp = Date.now();
  }

  /**
   * Cleanup event listeners and intervals
   */
  cleanup(): void {
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    this.stopHeartbeat();
  }

  /**
   * Utility to detect if we're on a mobile device
   */
  static isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  /**
   * Utility to detect if we're in a mobile browser that backgrounds connections
   */
  static isMobileBrowser(): boolean {
    if (typeof window === 'undefined') return false;
    
    const isMobile = MobileSync.isMobile();
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    
    return isMobile && !isStandalone; // Mobile browser (not PWA)
  }
}

// Export singleton instance
export const mobileSync = MobileSync.getInstance();