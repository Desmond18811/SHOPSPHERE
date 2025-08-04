import mongoose from "mongoose";
import { MONGO_URI, NODE_ENV } from "./env.js";
import NodeCache from "node-cache";

// Initialize cache with 10 minute TTL
export const cache = new NodeCache({ stdTTL: 600 });

if (!MONGO_URI) {
    throw new Error(
        "Please define the MONGODB_URI environment variable inside .env.<development/production>.local"
    );
}

// Enhanced connection configuration
const dbOptions = {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 50, // Increased connection pool size
    socketTimeoutMS: 30000, // Reduced socket timeout
    connectTimeoutMS: 30000,
    waitQueueTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    retryReads: true,
    bufferCommands: false, // Disable buffering
};

// For Mongoose v6+, these options are set by default:
// - useCreateIndex is now always true
// - useNewUrlParser is now always true
// - useUnifiedTopology is now always true
// - runValidators is true by default for update operations

const connectToDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI, dbOptions);
        console.log(`✅ Connected to database in ${NODE_ENV} mode`);

        // Warm up the connection pool
        await mongoose.connection.db.admin().ping();
    } catch (error) {
        console.error("❌ Database connection error:", error.message);
        setTimeout(connectToDatabase, 5000);
    }
};

// Event handlers
mongoose.connection.on("connected", () => {
    console.log("🟢 Mongoose connected to DB cluster");
    cache.flushAll(); // Clear cache on reconnect
});

mongoose.connection.on("disconnected", () => {
    console.log("🔴 Mongoose disconnected");
    setTimeout(connectToDatabase, 5000);
});

mongoose.connection.on("error", (err) => {
    console.error("❌ Mongoose connection error:", err);
});

// Graceful shutdown handler
process.on("SIGINT", async () => {
    await mongoose.connection.close();
    console.log("Mongoose connection closed due to app termination");
    process.exit(0);
});

export default connectToDatabase;