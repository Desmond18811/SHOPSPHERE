import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Products.js';
import Store from '../models/Store.js';
import { sendManagerAlert } from '../config/email.js';
import Paystack from 'paystack-node';
import { PAYSTACK_SECRET_KEY, PAYSTACK_WEBHOOK_SECRET } from "../config/env.js";

dotenv.config();

// Configure Paystack
const paystackConfig = {
    host: 'api.paystack.co',
    protocol: 'https',
    publicKey: PAYSTACK_SECRET_KEY,
    secretKey: PAYSTACK_SECRET_KEY,
    timeout: 30000
};
const paystack = new Paystack(paystackConfig);

const baseUrl = 'https://api.paystack.co';

// Helper function to normalize reference format
const normalizeReference = (ref) => {
    if (!ref) return ref;
    return ref.startsWith('ref_') ? ref : `ref_${ref}`;
};

/**
 * Initialize a Paystack transaction
 */
const initializeTransaction = async (email, amount, metadata, callbackUrl) => {
    try {
        if (!PAYSTACK_SECRET_KEY) {
            throw new Error('PAYSTACK_SECRET_KEY is required');
        }
        if (!email || !amount || amount <= 0) {
            throw new Error(`Invalid parameters: email=${email}, amount=${amount}`);
        }
        if (!callbackUrl) {
            throw new Error('Callback URL is required');
        }

        const response = await axios.post(
            `${baseUrl}/transaction/initialize`,
            {
                email,
                amount: Math.round(amount * 100), // Convert to kobo
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

/**
 * Verify a Paystack transaction with retry logic
 */
const verifyTransaction = async (reference, attempt = 1) => {
    const maxAttempts = 5;
    const baseDelay = 2000;

    try {
        console.log(`Verification attempt ${attempt} for reference: ${reference}`);

        // Remove 'ref_' prefix for Paystack API
        const paystackReference = reference.startsWith('ref_') ? reference.substring(4) : reference;

        const response = await axios.get(
            `${baseUrl}/transaction/verify/${encodeURIComponent(paystackReference)}`,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 10000
            }
        );

        if (!response.data || typeof response.data.status === 'undefined') {
            throw new Error('Invalid Paystack response format');
        }

        if (response.data.data?.status === 'pending') {
            if (attempt < maxAttempts) {
                const delay = baseDelay * attempt;
                console.log(`Transaction pending, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return verifyTransaction(reference, attempt + 1);
            }
            throw new Error('Transaction still pending after maximum retries');
        }

        return response.data;

    } catch (error) {
        console.error(`Verification error (attempt ${attempt}):`, error.message);

        if (attempt < maxAttempts &&
            error.response?.status !== 404 &&
            !error.message.includes('Invalid Paystack response')) {

            const delay = baseDelay * attempt;
            await new Promise(resolve => setTimeout(resolve, delay));
            return verifyTransaction(reference, attempt + 1);
        }

        throw error;
    }
};

/**
 * Create a new payment
 */
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
                message: 'Not authorized',
            });
        }

        if (!process.env.APP_URL) {
            return res.status(500).json({
                status: 'error',
                message: 'APP_URL not configured',
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
                message: 'Unauthorized',
            });
        }

        if (order.orderStatus === 'Cancelled') {
            return res.status(400).json({
                status: 'error',
                message: 'Order cancelled',
            });
        }

        // Check product availability
        for (const item of order.orderItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(400).json({
                    status: 'error',
                    message: `Product not found: ${item.name}`,
                });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({
                    status: 'error',
                    message: `Insufficient stock for ${product.name}`,
                });
            }
        }

        const callbackUrl = `${process.env.APP_URL}/api/payments/webhook`;
        const { data } = await initializeTransaction(
            req.user.email,
            order.totalPrice,
            { orderId: order._id.toString(), userId: req.user.id },
            callbackUrl
        );

        // Ensure reference starts with 'ref_'
        const transactionReference = normalizeReference(data.reference);

        const payment = await Payment.create({
            user: req.user.id,
            order: orderId,
            amount: order.totalPrice,
            currency: 'NGN',
            paymentMethod: 'card',
            transactionReference,
            status: 'pending',
            metadata: {
                orderItems: order.orderItems,
                saveCard,
                paystackInitialization: data
            },
        });

        console.log('Payment initialized:', {
            paymentId: payment._id,
            reference: transactionReference,
            amount: order.totalPrice
        });

        return res.status(200).json({
            status: 'success',
            message: 'Payment initialized',
            data: {
                paymentId: payment._id,
                authorizationUrl: data.authorization_url,
                accessCode: data.access_code,
                reference: transactionReference,
                saveCard: Boolean(saveCard),
            },
        });

    } catch (error) {
        console.error('Payment creation error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Payment initialization failed',
        });
    }
};

/**
 * Verify a payment
 */

export const verifyPayment = async (req, res) => {
    const { reference } = req.params;
    const startTime = Date.now();

    try {
        // 1. Validate reference format
        if (!reference || !reference.startsWith('ref_')) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid reference format',
                example: 'ref_123456789',
                received: reference
            });
        }

        // 2. Check local database first
        const localPayment = await Payment.findOne({
            transactionReference: reference
        }).populate('order', 'orderStatus totalPrice');

        if (!localPayment) {
            return res.status(404).json({
                status: 'error',
                message: 'Payment record not found',
                solution: 'Please initiate payment first',
                reference
            });
        }

        // 3. Return cached status if already verified
        if (localPayment.status === 'success') {
            return res.json({
                status: 'success',
                message: 'Payment already verified',
                data: {
                    paymentId: localPayment._id,
                    amount: localPayment.amount,
                    orderStatus: localPayment.order?.orderStatus,
                    verifiedAt: localPayment.paymentDate,
                    fromCache: true
                }
            });
        }

        // 4. Verify with Paystack
        const verification = await verifyTransaction(reference);

        // 5. Handle different Paystack statuses
        switch (verification.data?.status) {
            case 'success':
                // Process successful payment
                const [updatedPayment, updatedOrder] = await Promise.all([
                    Payment.findByIdAndUpdate(
                        localPayment._id,
                        {
                            status: 'success',
                            paymentDate: new Date(),
                            authorizationCode: verification.data.authorization?.authorization_code,
                            paymentMethod: verification.data.channel || 'card',
                            metadata: {
                                ...localPayment.metadata,
                                verifiedAt: new Date(),
                                paystackData: verification.data,
                                verificationDuration: Date.now() - startTime
                            }
                        },
                        { new: true }
                    ),
                    localPayment.order ? Order.findByIdAndUpdate(
                        localPayment.order._id,
                        {
                            orderStatus: 'Processing',
                            isPaid: true,
                            paidAt: new Date(),
                            paymentInfo: {
                                id: reference,
                                status: 'success',
                                reference,
                                channel: verification.data.channel,
                                amount: verification.data.amount / 100,
                                authorizationCode: verification.data.authorization?.authorization_code
                            }
                        }
                    ) : null
                ]);

                return res.json({
                    status: 'success',
                    message: 'Payment verified successfully',
                    data: {
                        paymentId: updatedPayment._id,
                        amount: updatedPayment.amount,
                        authorizationCode: updatedPayment.authorizationCode,
                        orderStatus: updatedOrder?.orderStatus || null,
                        duration: `${(Date.now() - startTime) / 1000} seconds`
                    }
                });

            case 'abandoned':
                // Handle abandoned payments
                await Payment.findByIdAndUpdate(
                    localPayment._id,
                    {
                        status: 'failed',
                        metadata: {
                            ...localPayment.metadata,
                            failureReason: 'User abandoned payment',
                            paystackStatus: 'abandoned',
                            lastVerificationAttempt: new Date()
                        }
                    }
                );

                return res.status(400).json({
                    status: 'error',
                    message: 'Payment was not completed',
                    paystackStatus: 'abandoned',
                    solution: 'Please initiate a new payment',
                    reference
                });

            case 'failed':
                // Handle failed payments
                await Payment.findByIdAndUpdate(
                    localPayment._id,
                    {
                        status: 'failed',
                        metadata: {
                            ...localPayment.metadata,
                            failureReason: verification.data.gateway_response || 'Payment failed',
                            paystackData: verification.data
                        }
                    }
                );

                return res.status(400).json({
                    status: 'error',
                    message: 'Payment failed',
                    paystackStatus: 'failed',
                    gatewayResponse: verification.data.gateway_response,
                    reference
                });

            default:
                // Handle unexpected statuses
                await Payment.findByIdAndUpdate(
                    localPayment._id,
                    {
                        status: 'failed',
                        metadata: {
                            ...localPayment.metadata,
                            failureReason: `Unexpected status: ${verification.data?.status}`,
                            paystackData: verification.data
                        }
                    }
                );

                return res.status(400).json({
                    status: 'error',
                    message: 'Payment verification failed',
                    paystackStatus: verification.data?.status,
                    reference
                });
        }

    } catch (error) {
        console.error('Payment verification error:', {
            error: error.message,
            reference,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Update payment record with error if exists
        if (reference) {
            await Payment.updateOne(
                { transactionReference: reference },
                {
                    $set: {
                        'metadata.lastVerificationError': error.message,
                        'metadata.lastVerificationAttempt': new Date()
                    },
                    $inc: { 'metadata.verificationAttempts': 1 }
                }
            );
        }

        return res.status(error.response?.status || 500).json({
            status: 'error',
            message: error.response?.data?.message || error.message || 'Payment verification failed',
            reference,
            ...(error.response?.data && { details: error.response.data })
        });
    }
};

/**
 * Charge a saved card
 */
export const chargeSavedCard = async (req, res) => {
    try {
        const { amount } = req.body;
        const { id: paymentId } = req.params;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid amount required',
                minimum: 100
            });
        }

        const originalPayment = await Payment.findOne({
            _id: paymentId,
            status: 'success',
            authorizationCode: { $exists: true }
        }).populate('user');

        if (!originalPayment) {
            const exists = await Payment.exists({ _id: paymentId });
            return res.status(404).json({
                status: 'error',
                message: exists ?
                    'Payment missing authorization code or not verified' :
                    'Payment not found',
                paymentId
            });
        }

        if (originalPayment.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized'
            });
        }

        const chargeData = {
            authorization_code: originalPayment.authorizationCode,
            email: originalPayment.user.email,
            amount: Math.round(amount * 100),
            reference: `recur_${Date.now()}_${originalPayment._id}`,
            metadata: {
                original_payment: originalPayment._id,
                user: req.user.id
            }
        };

        const response = await axios.post(
            `${baseUrl}/transaction/charge_authorization`,
            chargeData,
            {
                headers: {
                    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000
            }
        );

        if (response.data.status === true && response.data.data.status === 'success') {
            const newPayment = await Payment.create({
                user: req.user.id,
                order: originalPayment.order,
                amount,
                currency: 'NGN',
                paymentMethod: 'card',
                status: 'success',
                transactionReference: response.data.data.reference,
                authorizationCode: originalPayment.authorizationCode,
                metadata: {
                    recurring: true,
                    parentPayment: originalPayment._id,
                    paystackResponse: response.data.data
                }
            });

            return res.status(200).json({
                status: 'success',
                message: 'Payment charged',
                data: {
                    paymentId: newPayment._id,
                    amount: newPayment.amount,
                    reference: newPayment.transactionReference
                }
            });
        } else {
            await Payment.create({
                user: req.user.id,
                order: originalPayment.order,
                amount,
                currency: 'NGN',
                paymentMethod: 'card',
                status: 'failed',
                transactionReference: response.data.data?.reference,
                metadata: {
                    error: response.data.message,
                    paystackResponse: response.data
                }
            });

            return res.status(400).json({
                status: 'error',
                message: response.data.message || 'Charge failed',
                paystackStatus: response.data.data?.status
            });
        }

    } catch (error) {
        console.error('Charge error:', {
            error: error.message,
            paymentId: req.params.id
        });

        return res.status(500).json({
            status: 'error',
            message: error.message || 'Charge failed'
        });
    }
};

/**
 * Get payment history
 */
export const getPaymentHistory = async (req, res) => {
    try {
        const payments = await Payment.find({ user: req.user.id })
            .populate('order')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            status: 'success',
            data: payments.map(p => ({
                id: p._id,
                amount: p.amount,
                status: p.status,
                method: p.paymentMethod,
                reference: p.transactionReference,
                date: p.createdAt,
                order: p.order ? {
                    id: p.order._id,
                    status: p.order.orderStatus
                } : null
            }))
        });

    } catch (error) {
        return res.status(500).json({
            status: 'error',
            message: 'Failed to get history'
        });
    }
};

/**
 * Webhook handler
 */
export const webhook = async (req, res) => {
    try {
        if (!PAYSTACK_WEBHOOK_SECRET) {
            return res.status(500).send('Webhook secret missing');
        }

        const hash = crypto
            .createHmac('sha512', PAYSTACK_WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.warn('Invalid webhook signature');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;
        if (event.event === 'charge.success') {
            const reference = normalizeReference(event.data.reference);

            const payment = await Payment.findOneAndUpdate(
                { transactionReference: reference },
                {
                    status: 'success',
                    paymentDate: new Date(),
                    authorizationCode: event.data.authorization?.authorization_code,
                    paymentMethod: event.data.channel || 'card',
                    metadata: {
                        paystackWebhook: event.data
                    }
                },
                { new: true }
            );

            if (payment?.order) {
                await Order.findByIdAndUpdate(
                    payment.order,
                    {
                        orderStatus: 'Processing',
                        isPaid: true,
                        paidAt: new Date(),
                        paymentInfo: {
                            id: reference,
                            status: 'success',
                            reference,
                            channel: event.data.channel,
                            amount: event.data.amount / 100
                        }
                    }
                );
            }

            console.log('Webhook processed:', reference);
        }

        return res.status(200).send('Webhook processed');

    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).send('Webhook failed');
    }
};

/**
 * Stock management helper
 */
const manageStockAndAlerts = async (order) => {
    try {
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
                            message: `${product.name} is out of stock in ${store.name}`
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Stock update error:', error);
    }
};