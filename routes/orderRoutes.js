import express from "express";
import {
    cancelOrder,
    createOrder,
    getAllOrders,
    getOrderById,
    getOrderStats,
    updateOrderStatus
} from "../controllers/order.js";
import {protect} from "../middleware/auth.js";

const router = express.Router();

router.post('/', protect, createOrder)
router.get('/', protect, getAllOrders)
router.get('/stats',  protect, getOrderStats)
router.get('/:id', protect, getOrderById)
router.put('/:id/status', protect, updateOrderStatus)
router.put('/:id/cancel', protect, cancelOrder)


export default router