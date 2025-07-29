import cloudinary from 'cloudinary'; // Import Cloudinary SDK
import { CloudinaryStorage } from 'multer-storage-cloudinary'; // Import Cloudinary storage for Multer
import dotenv from 'dotenv'; // Import dotenv to load environment variables

dotenv.config(); // Load environment variables from .env file

// Configure Cloudinary with environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary storage for Multer
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'ecommerce', // Default folder for uploads
        allowed_formats: ['jpeg', 'jpg', 'png'], // Allowed file formats
        transformation: [{ width: 500, height: 500, crop: 'limit' }], // Image transformation settings
    },
});

// Export Cloudinary instance and storage as named exports
export { cloudinary, storage };