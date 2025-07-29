import {config} from "dotenv";

config({path: `.env.${process.env.NODE_ENV || 'development'}.local`});

export const {
    PORT,
    NODE_ENV,
    MONGO_URI,
    JWT_SECRET,
    JWT_EXPIRES_IN,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    EMAIL_FROM,
    EMAIL_PORT,
    EMAIL_USER,
    EMAIL_PASSWORD,
    PAYSTACK_SECRET_KEY,
    PAYSTACK_WEBHOOK_SECRET
}   = process.env