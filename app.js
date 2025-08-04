import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import cluster from "cluster";
import os from "os";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import connectToDatabase from "./config/db.js";
import errorHandler from "./middleware/error.js";

// Route imports
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import storeRoutes from "./routes/storeRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";

// Initialize environment
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express with optimizations
const app = express();

// 1. Security Middleware
app.use(helmet());
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
        },
    })
);

// 2. Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per window
    message: "Too many requests from this IP, please try again later",
});
app.use("/api/", limiter);

// 3. Compression
app.use(
    compression({
        level: 6, // Optimal compression level
        threshold: "10kb", // Only compress responses larger than 10kb
    })
);

// 4. CORS Configuration
app.use(
    cors({
        origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["X-Response-Time"],
        maxAge: 86400, // 24 hours
    })
);

// 5. Body Parsing with sensible limits
app.use(
    bodyParser.json({
        limit: "10mb",
        inflate: true,
        strict: true,
    })
);
app.use(
    bodyParser.urlencoded({
        limit: "10mb",
        extended: true,
        parameterLimit: 1000,
    })
);

// 6. Static Files with Cache Control
app.use(
    express.static(path.join(__dirname, "public"), {
        maxAge: "1d",
        setHeaders: (res, path) => {
            if (path.endsWith(".html")) {
                res.setHeader("Cache-Control", "no-cache");
            } else {
                res.setHeader(
                    "Cache-Control",
                    "public, max-age=86400, immutable"
                );
            }
        }
    })
);

// 7. Response Time Header
app.use((req, res, next) => {
    const start = Date.now();

    // Override the res.end method to capture finish timing
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
        const duration = Date.now() - start;
        res.setHeader('X-Response-Time', `${duration}ms`);
        originalEnd.call(this, chunk, encoding);
    };

    next();
});
// 8. Health Check Endpoint
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
    });
});

// 9. API Routes
const apiRouter = express.Router();
apiRouter.get("/", (req, res) => {
    res.status(200).json({
        status: "success",
        message: "SHOPSHPHERE API is running 🛒",
        timestamp: new Date().toISOString(),
    });
});

// Mount all routes
apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", productRoutes);
apiRouter.use("/stores", storeRoutes);
apiRouter.use("/orders", orderRoutes);
apiRouter.use("/cart", cartRoutes);
apiRouter.use("/payments", paymentRoutes);
apiRouter.use("/delivery", deliveryRoutes);

app.use("/api", apiRouter);

// 10. Error Handling
app.use(errorHandler);

// 11. Server Startup with Cluster Support
const startServer = async () => {
    await connectToDatabase();

    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
        console.log(`🚀 Server running in ${process.env.NODE_ENV || "development"} mode`);
        console.log(`🔗 http://localhost:${PORT}`);
        console.log(`📊 Performance optimizations enabled`);
    });

    // Socket timeout configuration
    server.keepAliveTimeout = 60000; // 60 seconds
    server.headersTimeout = 65000; // 65 seconds
};

// Cluster mode for production
if (cluster.isPrimary && process.env.NODE_ENV === "production") {
    console.log(`Primary ${process.pid} is running`);
    const numCPUs = os.cpus().length;

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`);
        cluster.fork(); // Replace the dead worker
    });
} else {
    startServer();
}

export default app;








// import express from 'express'; // Import Express framework
// import dotenv from 'dotenv'; // Import dotenv to load environment variables
// import mongoose from 'mongoose'; // Import Mongoose for MongoDB connection
// import bodyParser from 'body-parser'; // Import body-parser to parse request bodies
// import cors from 'cors'; // Import CORS to handle cross-origin requests
// import path from 'path'; // Import path for file handling
// import { fileURLToPath } from 'url';
//
//
// // Import error handling middleware
// import errorHandler from './middleware/error.js';
// import authRoutes from "./routes/authRoutes.js";
// import productRoutes from "./routes/productRoutes.js";
// import storeRoutes from "./routes/storeRoutes.js";
// import orderRoutes from "./routes/orderRoutes.js";
// import paymentRoutes from "./routes/paymentRoutes.js";
// import cartRoutes from "./routes/cartRoutes.js";
// import connectToDatabase from "./config/db.js";
// import deliveryRoutes from "./routes/deliveryRoutes.js";
//
// // Load environment variables
// dotenv.config();
//
// // Get the directory name for __dirname replacement (ES modules)
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
//
// // Initialize Express app
// const app = express();
//
// app.use(cors())
// app.use(bodyParser.json({ limit: '50mb' }));
// app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
//
// app.use(express.static(path.join(__dirname, 'public')));
//
// const connectDB = async () => {
//     try {
//         await mongoose.connect(process.env.MONGO_URI, {
//             serverSelectionTimeoutMS: 5000,
//             maxPoolSize: 10,
//             socketTimeoutMS: 45000
//         });
//         console.log('✅ MongoDB connected successfully');
//     } catch (err) {
//         console.error('❌ MongoDB connection error:', err.message);
//         // Retry after 5 seconds
//         setTimeout(connectDB, 5000);
//     }
// };
//
// // Connection events
// mongoose.connection.on('connected', () => {
//     console.log('🟢 Mongoose connected to DB');
// });
//
// mongoose.connection.on('disconnected', () => {
//     console.log('🔴 Mongoose disconnected');
//     setTimeout(connectDB, 5000);
// });
//
// mongoose.connection.on('error', (err) => {
//     console.error('❌ Mongoose connection error:', err);
// });
//
// app.get('/', (req, res) => {
//     res.status(200).json({
//         status: 'success',
//         message: 'SHOPSHPHERE API is running 🛒',
//
//     });
// });
// app.use('/api/auth', authRoutes);
// app.use('/api/products', productRoutes)
// app.use('/api/stores', storeRoutes)
// app.use('/api/orders', orderRoutes)
// app.use('/api/cart', cartRoutes)
// app.use('/api/payments', paymentRoutes)
// app.use('/api/delivery', deliveryRoutes)
//
// app.use(errorHandler);
//
// const PORT = process.env.PORT || 3000;
//
// const startServer = async () =>{
//     await connectToDatabase();
//
//     app.listen(PORT, () => {
//         console.log(` 🚀 Server running on port: "https://localhost:${ PORT }`);
//     })
// }
//
// startServer()
//
// export default app;