import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import User from '../models/User.js';
import {
    sendWelcomeEmail,
    sendWelcomeBackEmail,
    sendOTPEmail,
} from '../config/email.js';
import mongoose from 'mongoose';
import {JWT_EXPIRES_IN, JWT_SECRET} from "../config/env.js";

export const register = async (req, res, next) => {
    try {
        const { name, email, password, role, address, phone } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                status: 'error',
                statusCode: 409,
                error: 'User already exists',
            });
        }

        const user = await User.create({
            name,
            email,
            password, // Password will be hashed by the pre('save') hook
            role,
            address,
            phone,
        });

        await sendWelcomeEmail(email, name).catch(err =>
            console.error('Failed to send welcome email:', err)
        );

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
            expiresIn: '1h'
        });

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
        });
    } catch (error) {
        console.error('Sign Up Error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};


export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Please provide an email and password',
            });
        }

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Invalid credentials',
            });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Invalid credentials',
            });
        }

        await sendWelcomeBackEmail(email, user.name).catch(err =>
            console.error('Failed to send welcome back email:', err)
        );

        const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN
        });

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Login Error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};


export const getMe = async (req, res, next) => {
    try {
        if(!req.user){
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found in request'
            })
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'User does not exist',
            });
        }
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const logout = async (req, res, next) => {
    try {

        if(!req.user){
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found in request'
            })
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'User not found',
            });
        }
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: `User ${user.name} logged out successfully`,
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const forgotPassword = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { email } = req.body;
        const user = await User.findOne({ email }).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'User does not exist',
            });
        }

        const secret = speakeasy.generateSecret({
            length: 20,
            name: `Password Reset (${user.email})`,
        }).base32;
        const otp = speakeasy.totp({
            secret,
            encoding: 'base32',
            digits: 6,
            step: 300,
            window: 0,
        });

        user.resetPasswordOTP = otp;
        user.resetPasswordSecretOTP = secret;
        user.resetPasswordExpires = Date.now() + 5 * 60 * 1000;
        user.resetPasswordAttempts = 0;

        await user.save({ session, validateBeforeSave: false });
        await sendOTPEmail(email, otp)
            .catch(err => console.error('Failed to send OTP email:', err));

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: `OTP has been sent, please check your email inbox`,
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const resetPassword = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { otp, newPassword } = req.body;
        const user = await User.findOne({
            resetPasswordOTP: otp,
            resetPasswordExpires: { $gt: Date.now() },
        }).session(session);

        if (!user || !speakeasy.totp.verify({
            secret: user.resetPasswordSecretOTP,
            encoding: 'base32',
            token: otp,
            window: 0,
        })) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Invalid or expired OTP',
            });
        }

        user.password = newPassword;
        user.resetPasswordOTP = undefined;
        user.resetPasswordSecretOTP = undefined;
        user.resetPasswordExpires = undefined;
        user.resetPasswordAttempts = 0;

        await user.save({ session, validateBeforeSave: false });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRE || '30d',
        });

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const updateDetails = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const fieldsToUpdate = {
            name: req.body.name,
            email: req.body.email,
            address: req.body.address,
            phone: req.body.phone,
        };

        const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
            new: true,
            runValidators: true,
            session,
        });

        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'User not found',
            });
        }

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                address: user.address,
                phone: user.phone,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const updatePassword = async (req, res, next) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Please provide current and new passwords',
            });
        }

        const user = await User.findById(req.user.id).select('+password').session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'User not found',
            });
        }

        const currentPasswordStr = String(currentPassword); // Ensure password is a string
        if (!(await user.matchPassword(currentPasswordStr))) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Current password is incorrect',
            });
        }

        user.password = newPassword;
        await user.save({ session, validateBeforeSave: false });
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRE || '30d',
        });

        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};