/**
 * Authentication middleware
 * Handles JWT token verification for both HTTP requests and WebSocket connections
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/config';

// Extend the Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export interface GuestRequest extends Request {
  guest?: {
    id: string;
    type: string;
  };
}

// Simple middleware to verify guest token
export const verifyGuestToken = (req: GuestRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Guest token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; type: string };
    
    // Verify it's a guest token
    if (decoded.type !== 'guest') {
      return res.status(403).json({ message: 'Invalid token type' });
    }
    
    req.guest = { id: decoded.id, type: decoded.type };
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// WebSocket authentication function
export const verifyWsToken = (token: string): { id: string; type: string } | null => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; type: string };
    
    // Verify it's a guest token
    if (decoded.type !== 'guest') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
};

// JWT authentication middleware for user authentication
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};
