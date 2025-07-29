import express from 'express';
import {
    register,
    login,
    logout,
    getMe,
    updatePassword,
    updateDetails,
    resetPassword,
    forgotPassword,
} from '../controllers/auth.js';
import {protect} from "../middleware/auth.js";
//import {protect} from "../middleware/auth.js";

const router = express.Router();

//router.use(protect);


router.post('/register', register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe); // Changed to /me for RESTful convention
router.put('/update-details', protect, updateDetails); // Changed to hyphen for consistency
router.put('/update-password', protect, updatePassword);
router.post('/reset-password', protect, resetPassword);
router.post('/forgot-password', protect, forgotPassword);  //this doesnt work

export default router;