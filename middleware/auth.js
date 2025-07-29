// middleware/auth.js
import User from "../models/User.js";
import jwt from "jsonwebtoken";

export const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            status: 'error',
            statusCode: 401,
            message: 'Not authorized, no token',
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Changed from decoded.id to decoded.userId
        req.user = await User.findById(decoded.userId);

        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found',
            });
        }

        next();
    } catch (error) {
        return res.status(401).json({
            status: 'error',
            statusCode: 401,
            message: 'Not authorized, token failed',
        });
    }
};

export const authorize = async (req, res, next) => {}