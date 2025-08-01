import express from 'express';
import {
    createPayment,
    verifyPayment,
    webhook,
    chargeSavedCard,
    getPaymentHistory
} from '../controllers/payment.js';
import { protect, authorize } from '../middleware/auth.js';
import app from "../app.js";

const router = express.Router();

// Create payment for specific order
router.post('/:orderId/payments', protect, createPayment);

// Change from GET to POST since we're verifying a specific payment
router.post('/verify/:reference', protect, verifyPayment);

//verify it directly from paystack
//app.get('https://api.paystack.co/transaction/verify/zpwz96ddv6')

// Paystack webhook (no auth needed)
router.post('/webhook', express.raw({ type: 'application/json' }), webhook);

// Charge saved card (admin or owner only)
router.post('/:id/charge', protect, authorize('admin'), chargeSavedCard);

// Get payment history (user-specific)
router.get('/history', protect, getPaymentHistory);

export default router;