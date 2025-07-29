import express from 'express'
import {
    checkStockAvailability,
    createOrder,
    createProduct, createProductReview,
    deleteProduct,
    getAllProducts,
    getProductsById,
    restockProduct,
    updateProduct
} from "../controllers/product.js";
import {storage} from "../config/cloudinary.js";
import multer from "multer";
import {protect} from "../middleware/auth.js";

const upload = multer({ storage });
const router = express.Router()



router.post('/', protect, upload.array('images', 10), createProduct)
router.put('/:id/restock', protect, restockProduct)
router.get('/', getAllProducts)
router.get('/:id', getProductsById)
router.put('/:id', protect, upload.array('images', 10), updateProduct)
router.delete('/:id', protect, deleteProduct)
router.post('/:id/reviews', protect, createProductReview)
router.get('/:id/stock', checkStockAvailability)
router.post('/orders', protect, createOrder)

export default router