import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Products.js';
import Store from '../models/Store.js';
import { sendManagerAlert } from '../config/email.js';

dotenv.config();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET;
const baseUrl = 'https://api.paystack.co';

const initializeTransaction = async (email, amount, orderId, callbackUrl) => {
    const response = await axios.post(
        `${baseUrl}/transaction/initialize`,
        {
            email,
            amount: amount * 100,
            orderId,
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
};

const verifyTransaction = async (reference) => {
    const response = await axios.get(`${baseUrl}/transaction/verify/${reference}`, {
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
    });
    return response.data;
};

export const createPayment = async (req, res, next) => {
    try {
        const { orderId, saveCard } = req.body || req;
        const order = await Order.findById(orderId);

        if (!order) {
            return res?.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Order not found',
            }) || { error: 'Order not found' };
        }

        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res?.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Unauthorized to process this payment',
            }) || { error: 'Unauthorized' };
        }

        // Check stock availability
        for (const item of order.orderItems) {
            const product = await Product.findById(item.product);
            if (!product || product.stock < item.quantity) {
                return res?.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Insufficient stock for ${product?.name || 'product'}`,
                }) || { error: 'Insufficient stock' };
            }
        }

        const callbackUrl = `${process.env.APP_URL}/api/payments/webhook`;
        const { data } = await initializeTransaction(req.user.email, order.totalPrice, orderId, callbackUrl);

        const payment = await Payment.create({
            user: req.user.id,
            order: orderId,
            amount: order.totalPrice,
            currency: 'NGN',
            paymentMethod: 'card',
            transactionReference: data.reference,
            metadata: { orderItems: order.orderItems },
        });

        return res?.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Payment initialized',
            data: {
                authorizationUrl: data.authorization_url,
                accessCode: data.access_code,
                reference: data.reference,
                saveCard: !!saveCard,
            },
        }) || { data: {
                authorizationUrl: data.authorization_url,
                accessCode: data.access_code,
                reference: data.reference,
                saveCard: !!saveCard,
            }};
    } catch (error) {
        return res?.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        }) || { error: error.message };
    }
};

export const verifyPayment = async (req, res, next) => {
    try {
        const { reference } = req.query;
        const { data } = await verifyTransaction(reference);

        if (!data.status || data.status !== 'success') {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Payment verification failed',
            });
        }

        const payment = await Payment.findOne({ transactionReference: reference });
        if (!payment) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Payment not found',
            });
        }

        payment.status = 'success';
        payment.paymentDate = Date.now();

        if (data.authorization?.authorization_code) {
            payment.authorizationCode = data.authorization.authorization_code;
            payment.paymentMethod = 'card';
        }

        await payment.save();

        const order = await Order.findById(payment.order);
        if (order) {
            order.paymentInfo = {
                id: reference,
                status: 'success',
                reference,
            };
            order.orderStatus = 'Processing';
            await order.save();
        }

        // Alert manager if any product is out of stock
        for (const item of order.orderItems) {
            const product = await Product.findById(item.product);
            if (product.stock <= 0) {
                const store = await Store.findById(product.store);
                await sendManagerAlert({
                    email: store.owner,
                    subject: 'Product Out of Stock',
                    message: `The product "${product.name}" in store "${store.name}" is out of stock.`,
                });
            }
        }

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Payment verified successfully',
            data: {
                paymentId: payment._id,
                orderId: payment.order,
                amount: payment.amount,
                status: payment.status,
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

export const webhook = async (req, res, next) => {
    try {
        const hash = crypto.createHmac('sha512', PAYSTACK_WEBHOOK_SECRET)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Invalid signature, possible security breach',
            });
        }

        const event = req.body;
        if (event.event === 'charge.success') {
            const reference = event.data.reference;
            const payment = await Payment.findOne({ transactionReference: reference });

            if (payment) {
                payment.status = 'success';
                payment.paymentDate = Date.now();
                if (event.data.authorization?.authorization_code) {
                    payment.authorizationCode = event.data.authorization.authorization_code;
                    payment.paymentMethod = 'card';
                }
                await payment.save();

                const order = await Order.findById(payment.order);
                if (order) {
                    order.paymentInfo = {
                        id: reference,
                        status: 'success',
                        reference,
                    };
                    order.orderStatus = 'Processing';
                    await order.save();
                }

                // Alert manager for out-of-stock products
                for (const item of order.orderItems) {
                    const product = await Product.findById(item.product);
                    if (product.stock <= 0) {
                        const store = await Store.findById(product.store);
                        await sendManagerAlert({
                            email: store.owner,
                            subject: 'Product Out of Stock',
                            message: `The product "${product.name}" in store "${store.name}" is out of stock.`,
                        });
                    }
                }
            }
        }

        return res.status(200).json({ message: 'Webhook received' });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const chargeSavedCard = async (req, res, next) => {
    try {
        const { paymentId, amount } = req.body;
        const payment = await Payment.findById(paymentId);

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




// import mongoose from 'mongoose'; // Import Mongoose for MongoDB operations
// import axios from 'axios'; // Import Axios for HTTP requests to Paystack API
// import dotenv from 'dotenv'; // Import dotenv to load environment variables
// import crypto from 'crypto'; // Import crypto for HMAC signature verification
// import Order from '../models/Order.js'; // Import Order model
// import Payment from '../models/Payment.js'; // Import Payment model
// import Product from '../models/Products.js'; // Import Product model for stock updates
// import Store from '../models/Store.js'; // Import Store model for alerts
// import { sendManagerAlert } from '../config/email.js'; // Import email function for alerts
//
// dotenv.config(); // Load environment variables from .env file
//
// const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY; // Paystack secret key for API calls
// const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET; // Paystack webhook secret for verification
// const baseUrl = 'https://api.paystack.co'; // Paystack API base URL
// const localBaseUrl = 'http://localhost:3000/api/payments'; // Base URL for Postman testing locally
// // Use https://your-ngrok-url/api/payments if using ngrok (e.g., https://abcd1234.ngrok.io/api/payments)
//
// const initializeTransaction = async (email, amount, orderId, callbackUrl) => {
//     // Initialize a transaction with Paystack
//     const response = await axios.post(
//         `${baseUrl}/transaction/initialize`,
//         {
//             email,
//             amount: amount * 100, // Convert to kobo (Paystack uses smallest currency unit)
//             orderId,
//             callback_url: callbackUrl, // URL Paystack redirects to after payment
//         },
//         {
//             headers: {
//                 Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
//                 'Content-Type': 'application/json',
//             },
//         }
//     );
//     return response.data; // Return transaction data including authorization URL
// };
//
// const verifyTransaction = async (reference) => {
//     // Verify a transaction with Paystack using its reference
//     const response = await axios.get(`${baseUrl}/transaction/verify/${reference}`, {
//         headers: {
//             Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
//             'Content-Type': 'application/json',
//         },
//     });
//     return response.data; // Return verification data
// };
//
// // Initialize payment for an order (called from cart checkout)
// export const createPayment = async (req, res, next) => {
//     const session = await mongoose.startSession(); // Start a Mongoose session for transactions
//     try {
//         await session.startTransaction(); // Begin a transaction
//
//         const { orderId, saveCard } = req.body || req; // Handle both direct requests and cart checkout calls
//         const order = await Order.findById(orderId).session(session); // Find the order
//
//         if (!order) {
//             await session.abortTransaction(); // Cancel if order not found
//             session.endSession();
//             if (res) return res.status(404).json({
//                 status: 'error',
//                 statusCode: 404,
//                 message: 'Order not found',
//             });
//             throw new Error('Order not found');
//         }
//
//         if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
//             await session.abortTransaction(); // Cancel if unauthorized
//             session.endSession();
//             if (res) return res.status(401).json({
//                 status: 'error',
//                 statusCode: 401,
//                 message: 'Unauthorized to process this payment',
//             });
//             throw new Error('Unauthorized');
//         }
//
//         // Check stock availability (already handled in cart checkout, but re-verified here)
//         for (const item of order.orderItems) {
//             const product = await Product.findById(item.product).session(session);
//             if (!product || product.stock < item.quantity) {
//                 await session.abortTransaction();
//                 session.endSession();
//                 if (res) return res.status(400).json({
//                     status: 'error',
//                     statusCode: 400,
//                     message: `Insufficient stock for ${product?.name || 'product'}`,
//                 });
//                 throw new Error('Insufficient stock');
//             }
//         }
//
//         const callbackUrl = `${process.env.APP_URL}/api/payments/webhook`; // Webhook URL for Paystack callback
//         const { data } = await initializeTransaction(req.user.email, order.totalPrice, orderId, callbackUrl);
//
//         const payment = await Payment.create([{
//             user: req.user.id,
//             order: orderId,
//             amount: order.totalPrice,
//             currency: 'NGN',
//             paymentMethod: 'card', // Default to card
//             transactionReference: data.reference,
//             metadata: { orderItems: order.orderItems },
//         }], { session });
//
//         await session.commitTransaction(); // Commit if successful
//         session.endSession();
//
//         if (res) return res.status(200).json({
//             status: 'success',
//             statusCode: 200,
//             message: 'Payment initialized',
//             data: {
//                 authorizationUrl: data.authorization_url, // URL for user to complete payment
//                 accessCode: data.access_code,
//                 reference: data.reference,
//                 saveCard: !!saveCard, // Indicate if card should be saved
//             },
//         });
//         return {
//             statusCode: 200,
//             data: {
//                 authorizationUrl: data.authorization_url,
//                 accessCode: data.access_code,
//                 reference: data.reference,
//                 saveCard: !!saveCard,
//             },
//         };
//     } catch (error) {
//         await session.abortTransaction(); // Roll back on error
//         session.endSession();
//         if (res) return res.status(500).json({
//             status: 'error',
//             statusCode: 500,
//             message: error.message,
//         });
//         throw error;
//     }
// };
//
// // Verify payment (can be called manually or via redirect)
// export const verifyPayment = async (req, res, next) => {
//     const session = await mongoose.startSession();
//     try {
//         await session.startTransaction();
//
//         const { reference } = req.query; // Get reference from query params (e.g., after redirect)
//         const { data } = await verifyTransaction(reference);
//
//         if (!data.status || data.status !== 'success') {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//                 status: 'error',
//                 statusCode: 400,
//                 message: 'Payment verification failed',
//             });
//         }
//
//         const payment = await Payment.findOne({ transactionReference: reference }).session(session);
//         if (!payment) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(404).json({
//                 status: 'error',
//                 statusCode: 404,
//                 message: 'Payment not found',
//             });
//         }
//
//         payment.status = 'success';
//         payment.paymentDate = Date.now();
//
//         // Save card authorization for recurring payments if requested
//         if (data.authorization && data.authorization.authorization_code) {
//             payment.authorizationCode = data.authorization.authorization_code;
//             payment.paymentMethod = 'card';
//         }
//
//         await payment.save({ session });
//
//         const order = await Order.findById(payment.order).session(session);
//         if (order) {
//             order.paymentInfo = {
//                 id: reference,
//                 status: 'success',
//                 reference,
//             };
//             order.orderStatus = 'Processing';
//             await order.save({ session });
//         }
//
//         // Alert manager if any product is out of stock
//         for (const item of order.orderItems) {
//             const product = await Product.findById(item.product).session(session);
//             if (product.stock <= 0) {
//                 const store = await Store.findById(product.store).session(session);
//                 await sendManagerAlert({
//                     email: store.owner,
//                     subject: 'Product Out of Stock',
//                     message: `The product "${product.name}" in store "${store.name}" is out of stock.`,
//                 });
//             }
//         }
//
//         await session.commitTransaction();
//         session.endSession();
//
//         return res.status(200).json({
//             status: 'success',
//             statusCode: 200,
//             message: 'Payment verified successfully',
//             data: {
//                 paymentId: payment._id,
//                 orderId: payment.order,
//                 amount: payment.amount,
//                 status: payment.status,
//             },
//         });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(500).json({
//             status: 'error',
//             statusCode: 500,
//             message: error.message,
//         });
//     }
// };
//
// // Handle Paystack webhook/callback
// export const webhook = async (req, res, next) => {
//     const session = await mongoose.startSession();
//     try {
//         await session.startTransaction();
//
//         const hash = crypto.createHmac('sha512', PAYSTACK_WEBHOOK_SECRET)
//             .update(JSON.stringify(req.body))
//             .digest('hex'); // Generate HMAC for signature verification
//         if (hash !== req.headers['x-paystack-signature']) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//                 status: 'error',
//                 statusCode: 400,
//                 message: 'Invalid signature, possible security breach',
//             });
//         }
//
//         const event = req.body; // Paystack webhook payload
//         if (event.event === 'charge.success') {
//             const reference = event.data.reference;
//             const payment = await Payment.findOne({ transactionReference: reference }).session(session);
//
//             if (payment) {
//                 payment.status = 'success';
//                 payment.paymentDate = Date.now();
//                 if (event.data.authorization && event.data.authorization.authorization_code) {
//                     payment.authorizationCode = event.data.authorization.authorization_code;
//                     payment.paymentMethod = 'card';
//                 }
//                 await payment.save({ session });
//
//                 const order = await Order.findById(payment.order).session(session);
//                 if (order) {
//                     order.paymentInfo = {
//                         id: reference,
//                         status: 'success',
//                         reference,
//                     };
//                     order.orderStatus = 'Processing';
//                     await order.save({ session });
//                 }
//
//                 // Alert manager for out-of-stock products
//                 for (const item of order.orderItems) {
//                     const product = await Product.findById(item.product).session(session);
//                     if (product.stock <= 0) {
//                         const store = await Store.findById(product.store).session(session);
//                         await sendManagerAlert({
//                             email: store.owner,
//                             subject: 'Product Out of Stock',
//                             message: `The product "${product.name}" in store "${store.name}" is out of stock.`,
//                         });
//                     }
//                 }
//             }
//         }
//
//         await session.commitTransaction();
//         session.endSession();
//
//         // Respond with 200 OK to acknowledge webhook
//         return res.status(200).json({ message: 'Webhook received' });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(500).json({
//             status: 'error',
//             statusCode: 500,
//             message: error.message,
//         });
//     }
// };
//
// // Charge saved card for recurring payment
// export const chargeSavedCard = async (req, res, next) => {
//     const session = await mongoose.startSession();
//     try {
//         await session.startTransaction();
//
//         const { paymentId, amount } = req.body;
//         const payment = await Payment.findById(paymentId).session(session);
//
//         if (!payment || !payment.authorizationCode) {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(404).json({
//                 status: 'error',
//                 statusCode: 404,
//                 message: 'Payment or authorization code not found',
//             });
//         }
//
//         if (payment.user.toString() !== req.user.id && req.user.role !== 'admin') {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(401).json({
//                 status: 'error',
//                 statusCode: 401,
//                 message: 'Unauthorized to charge this payment',
//             });
//         }
//
//         const response = await axios.post(
//             `${baseUrl}/transaction/charge_authorization`,
//             {
//                 authorization_code: payment.authorizationCode,
//                 email: req.user.email,
//                 amount: amount * 100, // In kobo
//             },
//             {
//                 headers: {
//                     Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
//                     'Content-Type': 'application/json',
//                 },
//             }
//         );
//
//         if (response.data.data.status === 'success') {
//             const newPayment = await Payment.create([{
//                 user: req.user.id,
//                 order: payment.order, // Link to original or new order
//                 amount,
//                 currency: 'NGN',
//                 paymentMethod: 'card',
//                 status: 'success',
//                 transactionReference: response.data.data.reference,
//                 authorizationCode: payment.authorizationCode,
//                 metadata: { recurring: true },
//             }], { session });
//
//             await session.commitTransaction();
//             session.endSession();
//
//             return res.status(200).json({
//                 status: 'success',
//                 statusCode: 200,
//                 message: 'Recurring payment successful',
//                 data: {
//                     paymentId: newPayment[0]._id,
//                     reference: response.data.data.reference,
//                 },
//             });
//         } else {
//             await session.abortTransaction();
//             session.endSession();
//             return res.status(400).json({
//                 status: 'error',
//                 statusCode: 400,
//                 message: 'Recurring payment failed',
//             });
//         }
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(500).json({
//             status: 'error',
//             statusCode: 500,
//             message: error.message,
//         });
//     }
// };
//
// // Get payment history for a user
// export const getPaymentHistory = async (req, res, next) => {
//     const session = await mongoose.startSession();
//     try {
//         await session.startTransaction();
//         const payments = await Payment.find({ user: req.user.id })
//             .populate('order', 'orderItems totalPrice orderStatus')
//             .session(session);
//
//         await session.commitTransaction();
//         session.endSession();
//
//         return res.status(200).json({
//             status: 'success',
//             statusCode: 200,
//             count: payments.length,
//             data: payments.map(payment => ({
//                 id: payment._id,
//                 amount: payment.amount,
//                 currency: payment.currency,
//                 paymentMethod: payment.paymentMethod,
//                 status: payment.status,
//                 transactionReference: payment.transactionReference,
//                 paymentDate: payment.paymentDate,
//                 order: payment.order,
//             })),
//         });
//     } catch (error) {
//         await session.abortTransaction();
//         session.endSession();
//         return res.status(500).json({
//             status: 'error',
//             statusCode: 500,
//             message: error.message,
//         });
//     }
// };