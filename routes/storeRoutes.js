import express from 'express';
import { createStore, getAllStores, getStoreById, updateStore, deleteStore } from '../controllers/store.js';
import multer from 'multer';
import { cloudinary, storage } from '../config/cloudinary.js';
import {protect} from "../middleware/auth.js";

const upload = multer({ storage });

const router = express.Router();


//router.use(protect)

router.post('/', protect, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), createStore);
router.get('/', getAllStores);
router.get('/:id', getStoreById);
router.put('/:id', protect, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), updateStore);
router.delete('/:id', protect, deleteStore);

export default router;