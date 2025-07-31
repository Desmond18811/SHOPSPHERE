import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Products.js';
import Store from '../models/Store.js';
import { sendManagerAlert } from '../config/email.js';

dotenv.config();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET;
const baseUrl = 'https://api.paystack.co';

const initializeTransaction = async (email, amount, metadata, callbackUrl) => {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            throw new Error('PAYSTACK_SECRET_KEY is not defined in environment variables');
        }
        if (!email || !amount || amount <= 0) {
            throw new Error(`Invalid parameters: email=${email}, amount=${amount}`);
        }
        if (!callbackUrl) {
            throw new Error('Callback URL is not defined');
        }
        const response = await axios.post(
            `${baseUrl}/transaction/initialize`,
            {
                email,
                amount: Math.round(amount * 100),
                metadata,
                callback_url: callbackUrl,
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Paystack initialization error:', error.response?.data || error.message);
        throw new Error(`Failed to initialize payment: ${error.response?.data?.message || error.message}`);
    }
};

// ... (verifyTransaction remains unchanged)

export const createPayment = async (req, res) => {
    try {
        const { saveCard } = req.body;
        const { orderId } = req.params;

        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid order ID',
            });
        }

        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                message: 'Not authorized, user not found in request',
            });
        }

        if (!process.env.APP_URL) {
            return res.status(500).json({
                status: 'error',
                message: 'APP_URL is not defined in environment variables',
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found',
            });
        }

        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized to process this payment',
            });
        }

        if (order.orderStatus === 'Cancelled') {
            return res.status(400).json({
                status: 'error',
                message: 'Cannot process payment for a cancelled order',
            });
        }

        for (const item of order.orderItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(400).json({
                    status: 'error',
                    message: `Product not found for item: ${item.name}`,
                });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({
                    status: 'error',
                    message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
                });
            }
        }

        console.log('Initializing payment for:', { email: req.user.email, amount: order.totalPrice });
        const callbackUrl = `${process.env.APP_URL}/api/payments/webhook`;
        const { data } = await initializeTransaction(
            req.user.email,
            order.totalPrice,
            { orderId },
            callbackUrl
        );

        const payment = await Payment.create({
            user: req.user.id,
            order: orderId,
            amount: order.totalPrice,
            currency: 'NGN',
            paymentMethod: 'card',
            transactionReference: data.reference,
            status: 'pending',
            metadata: { orderItems: order.orderItems, saveCard },
        });

        return res.status(200).json({
            status: 'success',
            message: 'Payment initialized',
            data: {
                authorizationUrl: data.authorization_url,
                accessCode: data.access_code,
                reference: data.reference,
                saveCard: Boolean(saveCard),
            },
        });
    } catch (error) {
        console.error('Payment creation error:', error.message);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Payment initialization failed',
        });
    }
};



export const verifyPayment = async (req, res) => {
    try {
        const { reference } = req.query;
        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'Payment reference is required',
            });
        }

        const verification = await verifyTransaction(reference);

        if (verification.data.status !== 'success') {
            return res.status(400).json({
                status: 'error',
                message: 'Payment verification failed',
                data: verification.data,
            });
        }

        const payment = await Payment.findOneAndUpdate(
            { transactionReference: reference },
            {
                status: 'success',
                paymentDate: new Date(),
                authorizationCode: verification.data.authorization?.authorization_code,
                paymentMethod: 'card',
            },
            { new: true }
        );

        if (!payment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment record not found',
            });
        }

        // Update order status
        const order = await Order.findByIdAndUpdate(
            payment.order,
            {
                paymentInfo: {
                    id: reference,
                    status: 'success',
                    reference,
                },
                orderStatus: 'Processing',
                isPaid: true,
                paidAt: new Date(),
            },
            { new: true }
        );

        // Stock management and alerts
        await manageStockAndAlerts(order);

        return res.status(200).json({
            status: 'success',
            message: 'Payment verified successfully',
            data: {
                paymentId: payment._id,
                orderId: payment.order,
                amount: payment.amount,
                status: payment.status,
            },
        });
    } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Payment verification failed',
        });
    }
};

// Helper function for stock management
const manageStockAndAlerts = async (order) => {
    for (const item of order.orderItems) {
        const product = await Product.findById(item.product);
        if (product) {
            product.stock -= item.quantity;
            await product.save();

            if (product.stock <= 0) {
                const store = await Store.findById(product.store);
                if (store) {
                    await sendManagerAlert({
                        email: store.owner,
                        subject: 'Product Out of Stock',
                        message: `The product "${product.name}" in store "${store.name}" is out of stock.`,
                    });
                }
            }
        }
    }
};

export const webhook = async (req, res) => {
    try {
        // Verify webhook signature
        const hash = crypto
            .createHmac('sha512', PAYSTACK_WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.warn('Invalid webhook signature - possible security breach');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        if (event.event === 'charge.success') {
            const reference = event.data.reference;

            const payment = await Payment.findOneAndUpdate(
                { transactionReference: reference },
                {
                    status: 'success',
                    paymentDate: new Date(),
                    authorizationCode: event.data.authorization?.authorization_code,
                    paymentMethod: 'card',
                },
                { new: true }
            );

            if (payment) {
                await Order.findByIdAndUpdate(
                    payment.order,
                    {
                        paymentInfo: {
                            id: reference,
                            status: 'success',
                            reference,
                        },
                        orderStatus: 'Processing',
                        isPaid: true,
                        paidAt: new Date(),
                    }
                );
            }
        }

        return res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Webhook processing error:', error);
        return res.status(500).send('Webhook processing failed');
    }
};





export const chargeSavedCard = async (req, res, next) => {
    try {
        const {amount } = req.body;
        const payment = await Payment.findById(req.params.id);

        if (!payment || !payment.authorizationCode) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Payment or authorization code not found',
            });
        }

        if (payment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Unauthorized to charge this payment',
            });
        }

        const response = await axios.post(
            `${baseUrl}/transaction/charge_authorization`,
            {
                authorization_code: payment.authorizationCode,
                email: req.user.email,
                amount: amount * 100,
            },
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.data.data.status === 'success') {
            const newPayment = await Payment.create({
                user: req.user.id,
                order: payment.order,
                amount,
                currency: 'NGN',
                paymentMethod: 'card',
                status: 'success',
                transactionReference: response.data.data.reference,
                authorizationCode: payment.authorizationCode,
                metadata: { recurring: true },
            });

            return res.status(200).json({
                status: 'success',
                statusCode: 200,
                message: 'Recurring payment successful',
                data: {
                    paymentId: newPayment._id,
                    reference: response.data.data.reference,
                },
            });
        } else {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Recurring payment failed',
            });
        }
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const getPaymentHistory = async (req, res, next) => {
    try {
        const payments = await Payment.find({ user: req.user.id })
            .populate('order', 'orderItems totalPrice orderStatus');

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            count: payments.length,
            data: payments.map(payment => ({
                id: payment._id,
                amount: payment.amount,
                currency: payment.currency,
                paymentMethod: payment.paymentMethod,
                status: payment.status,
                transactionReference: payment.transactionReference,
                paymentDate: payment.paymentDate,
                order: payment.order,
            })),
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

