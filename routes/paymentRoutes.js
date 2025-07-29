import express from 'express';
import { createPayment, verifyPayment, webhook, chargeSavedCard, getPaymentHistory } from '../controllers/payment.js';

const router = express.Router();

router.post('/', createPayment);
router.get('/verify', verifyPayment);
router.post('/webhook', webhook);
router.post('/charge', chargeSavedCard);
router.get('/history', getPaymentHistory);

export default router;