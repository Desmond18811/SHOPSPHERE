import express from "express";
import {
    addToCart,
    checkout,
    clearCart,
    getCart,
    removeFromCart,
    updateCartItems,
} from "../controllers/cart.js";
import {protect} from "../middleware/auth.js";

const router = express.Router()

// router.post('/:id/addToCart',, addToCart)
router.post('/:productId',  protect, addToCart);
router.put( '/:productId', protect, updateCartItems)
router.delete('/:productId', protect, removeFromCart)
router.delete('/', protect, clearCart)
router.get('/', protect, getCart)
router.post('/:productId/checkout', protect, checkout)

export default router
