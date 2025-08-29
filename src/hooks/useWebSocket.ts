/**
 * Enhanced WebSocket hook with mobile reconnection support
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { mobileSync } from '@/lib/mobileSync';

export interface WebSocketOptions {
  boardId: string;
  userId?: string;
  autoReconnect?: boolean;
  enableMobileSync?: boolean;
}

export interface WebSocketState {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  lastError?: Error;
}

export function useWebSocket(options: WebSocketOptions) {
  const { boardId, userId, autoReconnect = true, enableMobileSync = true } = options;
  
  const [state, setState] = useState<WebSocketState>({
    socket: null,
    isConnected: false,
    isReconnecting: false
  });

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle sync requirement from mobile sync
  const handleSyncRequired = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🔄 Mobile sync requesting board refresh');
      socketRef.current.emit('request-sync', {
        boardId,
        lastKnownTimestamp: mobileSync.getSyncState().lastBoardUpdateTimestamp
      });
    }
  }, [boardId]);

  // Initialize mobile sync if enabled
  useEffect(() => {
    if (enableMobileSync && typeof window !== 'undefined') {
      mobileSync.initialize(handleSyncRequired);
      
      return () => {
        mobileSync.cleanup();
      };
    }
  }, [enableMobileSync, handleSyncRequired]);

  // Set up heartbeat
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected && !mobileSync.getSyncState().isInBackground) {
        const heartbeatData = mobileSync.getHeartbeatData(boardId);
        socketRef.current.emit('heartbeat', heartbeatData);
      }
    }, 15000); // Send heartbeat every 15 seconds
  }, [boardId]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    // Clean up existing connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState(prev => ({ ...prev, isReconnecting: true, lastError: undefined }));

    // Determine WebSocket URL
    let wsUrl = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
    if (!wsUrl) {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      if (process.env.NODE_ENV === 'development' && window.location.port !== '6832') {
        wsUrl = `${protocol}://${window.location.hostname}:6832`;
      } else {
        wsUrl = `${protocol}://${window.location.host}`;
      }
    }

    console.log('🔌 Connecting to WebSocket:', wsUrl);
    
    const newSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnectionAttempts: autoReconnect ? 5 : 0,
      reconnectionDelay: 2000,
    });

    socketRef.current = newSocket;

    // Connection handlers
    newSocket.on('connect', () => {
      console.log('✅ Connected to WebSocket');
      
      // Send join-board with mobile sync data
      const joinData = enableMobileSync 
        ? mobileSync.getJoinBoardData(boardId, userId)
        : { boardId, userId };
      
      newSocket.emit('join-board', joinData);
      startHeartbeat();
      
      setState(prev => ({ 
        ...prev, 
        socket: newSocket, 
        isConnected: true, 
        isReconnecting: false 
      }));
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from WebSocket:', reason);
      stopHeartbeat();
      
      setState(prev => ({ 
        ...prev, 
        isConnected: false 
      }));

      // Auto-reconnect for unexpected disconnections
      if (autoReconnect && reason !== 'io client disconnect') {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Attempting to reconnect...');
          connect();
        }, 3000);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('🚫 WebSocket connection error:', error);
      setState(prev => ({ 
        ...prev, 
        lastError: error, 
        isReconnecting: false 
      }));

      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('🔄 Retrying connection after error...');
          connect();
        }, 5000);
      }
    });

    // Handle board refresh events
    newSocket.on('board-refresh', (data) => {
      console.log('🔄 Received board refresh:', data);
      if (enableMobileSync) {
        mobileSync.markSyncCompleted();
      }
    });

    // Handle incremental pixel updates
    newSocket.on('pixel-updates', (data) => {
      console.log('🔄 Received incremental pixel updates:', data);
      if (enableMobileSync && data.payload?.syncTimestamp) {
        mobileSync.updateBoardTimestamp(data.payload.syncTimestamp);
      }
    });

    // Handle regular board state
    newSocket.on('board-state', (data) => {
      console.log('📋 Received board state:', data);
      if (enableMobileSync) {
        mobileSync.updateBoardTimestamp();
      }
    });

  }, [boardId, userId, autoReconnect, enableMobileSync, startHeartbeat, stopHeartbeat]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    console.log('🔌 Manually disconnecting WebSocket');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    stopHeartbeat();
    
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setState(prev => ({ 
      ...prev, 
      socket: null, 
      isConnected: false, 
      isReconnecting: false 
    }));
  }, [stopHeartbeat]);

  // Manual sync request
  const requestSync = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🔄 Manually requesting board sync');
      const syncState = mobileSync.getSyncState();
      socketRef.current.emit('request-sync', {
        boardId,
        lastKnownTimestamp: syncState.lastBoardUpdateTimestamp
      });
    }
  }, [boardId]);

  // Initial connection
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  // Update board timestamp when we receive pixel updates
  const updateLastUpdate = useCallback(() => {
    if (enableMobileSync) {
      mobileSync.updateBoardTimestamp();
    }
  }, [enableMobileSync]);

  return {
    ...state,
    connect,
    disconnect,
    requestSync,
    updateLastUpdate,
    needsSync: enableMobileSync ? mobileSync.needsSync() : false,
    syncState: enableMobileSync ? mobileSync.getSyncState() : null
  };
}