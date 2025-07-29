import express from 'express'; // Import Express framework
import dotenv from 'dotenv'; // Import dotenv to load environment variables
import mongoose from 'mongoose'; // Import Mongoose for MongoDB connection
import bodyParser from 'body-parser'; // Import body-parser to parse request bodies
import cors from 'cors'; // Import CORS to handle cross-origin requests
import path from 'path'; // Import path for file handling
import { fileURLToPath } from 'url';


// Import error handling middleware
import errorHandler from './middleware/error.js';
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import storeRoutes from "./routes/storeRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import connectToDatabase from "./config/db.js"; // Custom error handler (to be created)

// Load environment variables
dotenv.config();

// Get the directory name for __dirname replacement (ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();

app.use(cors())
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10,
            socketTimeoutMS: 45000
        });
        console.log('✅ MongoDB connected successfully');
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        // Retry after 5 seconds
        setTimeout(connectDB, 5000);
    }
};

// Connection events
mongoose.connection.on('connected', () => {
    console.log('🟢 Mongoose connected to DB');
});

mongoose.connection.on('disconnected', () => {
    console.log('🔴 Mongoose disconnected');
    setTimeout(connectDB, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Mongoose connection error:', err);
});

app.get('/', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'SHOPSHPHERE API is running 🛒',

    });
});
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes)
app.use('/api/stores', storeRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/payments', paymentRoutes)

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const startServer = async () =>{
    await connectToDatabase();

    app.listen(PORT, () => {
        console.log(` 🚀 Server running on port: "https://localhost:${ PORT }`);
    })
}

startServer()

export default app;