import mongoose from "mongoose";
import {MONGO_URI, NODE_ENV} from "./env.js";

if (!MONGO_URI) {
    throw new Error(
        "Please define the MONGODB_URI environment variable inside .env.<development/production>.local"
    );
}

const connectToDatabase = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 10,
            socketTimeoutMS: 45000,
        });
        console.log(`Connected to database in ${NODE_ENV}`);
    } catch (error) {
        console.error("Error connecting to database:", error.message);
        setTimeout(connectToDatabase, 5000); // Retry after 5 seconds
    }
};

// Connection event handlers
mongoose.connection.on("connected", () => {
    console.log("🟢 Mongoose connected to database");
});

mongoose.connection.on("disconnected", () => {
    console.log("🔴 Mongoose disconnected");
});

mongoose.connection.on("error", (err) => {
    console.error("❌ Mongoose connection error:", err);
});

export default connectToDatabase;