import express from 'express';
const router = express.Router();
import { getSettings, updateSettings } from '../controllers/adminController.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

router.get('/', getSettings); // Publicly accessible for theme/config loading
router.put('/', authMiddleware, adminMiddleware, updateSettings); // Only admin can update

export default router;