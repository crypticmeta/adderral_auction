/**
 * Authentication routes
 * Defines endpoints for guest ID generation and health checks
 */

import { Router } from 'express';
import { getGuestId, healthCheck } from '../controllers/authController';

const router = Router();

// Guest ID route
router.post('/guest-id', getGuestId);

// Health check route
router.get('/health', healthCheck);

export default router;
