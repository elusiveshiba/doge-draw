/**
 * Secure JWT authentication utilities
 * Centralizes all JWT operations with proper error handling
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from './config';
import { logger } from './logger';

interface TokenPayload extends JWTPayload {
  userId: string;
  walletAddress: string;
  isAdmin?: boolean;
}

class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

const secret = new TextEncoder().encode(config.jwtSecret);

export class AuthService {
  /**
   * Generate a secure JWT token
   */
  static async generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
    try {
      const token = await new SignJWT({
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        isAdmin: payload.isAdmin || false,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(config.jwtExpirationTime)
        .setIssuer('doge-draw')
        .setAudience('doge-draw-users')
        .sign(secret);
      
      logger.debug('JWT token generated successfully', { userId: payload.userId });
      return token;
    } catch (error) {
      logger.error('Failed to generate JWT token', { error, userId: payload.userId });
      throw new AuthError('Token generation failed', 'TOKEN_GENERATION_FAILED');
    }
  }

  /**
   * Verify and decode a JWT token
   */
  static async verifyToken(token: string): Promise<TokenPayload> {
    if (!token) {
      throw new AuthError('Token is required', 'TOKEN_MISSING');
    }

    try {
      const { payload } = await jwtVerify(token, secret, {
        issuer: 'doge-draw',
        audience: 'doge-draw-users',
      });

      // Validate required fields
      if (!payload.userId || typeof payload.userId !== 'string') {
        throw new AuthError('Invalid token payload: missing userId', 'INVALID_PAYLOAD');
      }

      if (!payload.walletAddress || typeof payload.walletAddress !== 'string') {
        throw new AuthError('Invalid token payload: missing walletAddress', 'INVALID_PAYLOAD');
      }

      logger.debug('JWT token verified successfully', { userId: payload.userId });
      return payload as TokenPayload;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }

      // Handle different JWT errors
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          logger.debug('JWT token expired', { token: token.substring(0, 20) + '...' });
          throw new AuthError('Token has expired', 'TOKEN_EXPIRED');
        }
        if (error.message.includes('signature')) {
          logger.warn('JWT token signature invalid', { token: token.substring(0, 20) + '...' });
          throw new AuthError('Invalid token signature', 'INVALID_SIGNATURE');
        }
        if (error.message.includes('malformed')) {
          logger.warn('JWT token malformed', { token: token.substring(0, 20) + '...' });
          throw new AuthError('Malformed token', 'MALFORMED_TOKEN');
        }
      }

      logger.error('JWT verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw new AuthError('Token verification failed', 'VERIFICATION_FAILED');
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | null): string {
    if (!authHeader) {
      throw new AuthError('Authorization header missing', 'HEADER_MISSING');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthError('Invalid authorization header format', 'INVALID_HEADER_FORMAT');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new AuthError('Bearer token is empty', 'EMPTY_TOKEN');
    }

    return token;
  }

  /**
   * Check if user is admin based on wallet address
   */
  static isAdmin(walletAddress: string): boolean {
    return config.adminWalletAddresses.includes(walletAddress);
  }

  /**
   * Middleware function for Next.js API routes
   */
  static async authenticateRequest(request: Request): Promise<TokenPayload> {
    try {
      const authHeader = request.headers.get('authorization');
      const token = this.extractTokenFromHeader(authHeader);
      const payload = await this.verifyToken(token);
      
      return payload;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      logger.error('Authentication middleware error', { error });
      throw new AuthError('Authentication failed', 'AUTH_FAILED');
    }
  }

  /**
   * Generate a secure password reset token (different from JWT)
   */
  static generateResetToken(): string {
    // Generate cryptographically secure random token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// Export the error class for use in API routes
export { AuthError };

// Convenience functions for backward compatibility
export const generateToken = AuthService.generateToken;
export const verifyToken = AuthService.verifyToken;
export const authenticateRequest = AuthService.authenticateRequest;