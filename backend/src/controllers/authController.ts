/**
 * Authentication controller
 * Handles guest ID generation for WebSocket connections and health checks
 */

import { Request, Response } from 'express';

// Simple guest ID generation for WebSocket connections
export const getGuestId = (req: Request, res: Response) => {
  try {
    // Generate a unique guest ID
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Return guest ID directly - no token needed
    return res.status(200).json({ guestId });
  } catch (error) {
    console.error('Guest ID generation error:', error);
    return res.status(500).json({ message: 'Server error generating guest ID' });
  }
};

// Health check endpoint
export const healthCheck = (req: Request, res: Response) => {
  return res.status(200).json({ status: 'ok', message: 'Auth service is running' });
};

