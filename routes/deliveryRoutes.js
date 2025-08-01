import express from 'express';
import {
    createDelivery,
    assignCourier,
    updateDeliveryStatus,
    trackDelivery,
    getNearbyDeliveries
} from '../controllers/delivery.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Create delivery (admin/store owner)
router.post('/order/:orderId', protect, authorize('admin', 'store-owner'), createDelivery);

// Assign courier (admin/dispatcher)
router.put('/:deliveryId/assign', protect, authorize('admin', 'dispatcher'), assignCourier);

// Update delivery status (courier)
router.put('/:deliveryId/status', protect, authorize('courier'), updateDeliveryStatus);

// Track delivery (customer/courier/admin)
router.get('/:deliveryId/track', protect, trackDelivery);

// Get nearby deliveries (couriers)
router.get('/nearby', protect, authorize('courier'), getNearbyDeliveries);

export default router;