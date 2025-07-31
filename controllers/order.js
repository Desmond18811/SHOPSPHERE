import mongoose from 'mongoose';
import Products from '../models/Products.js';
import Order from '../models/Order.js';
import Store from '../models/Store.js';
import { sendManagerAlert } from '../config/email.js';

export const createOrder = async (req, res) => {
    try {
        const { orderItems, shippingInfo, paymentInfo, itemsPrice, taxPrice, shippingPrice, totalPrice } = req.body;

        // Validate required fields
        const requiredFields = ['orderItems', 'shippingInfo', 'paymentInfo', 'itemsPrice', 'taxPrice', 'shippingPrice', 'totalPrice'];
        for (const field of requiredFields) {
            if (!req.body[field]) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Missing required field: ${field}`,
                });
            }
        }

        // Validate req.user
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found in request',
            });
        }

        // Validate orderItems
        if (!Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Order items must be a non-empty array',
            });
        }

        // Validate products and stock
        for (const item of orderItems) {
            if (!mongoose.isValidObjectId(item.product)) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Invalid product ID for item: ${item.name}`,
                });
            }
            const product = await Products.findById(item.product);
            if (!product) {
                return res.status(404).json({
                    status: 'error',
                    statusCode: 404,
                    message: `Product not found for item: ${item.name}`,
                });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Insufficient stock for ${product.name}. Available: ${product.stock}`,
                });
            }
        }

        // Create order
        const order = await Order.create({
            user: req.user.id,
            orderItems,
            shippingInfo,
            paymentInfo,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice,
            orderStatus: 'Processing',
        });

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            message: 'Order created successfully',
            data: order,
        });
    } catch (error) {
        console.error('Create order error:', error.message);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const getAllOrders = async(req, res) => {
    try {
        const orders = await Order.find(req.user.role === 'admin' ? {} : {user: req.user.id})
            .populate('user', 'name email')
            .populate('orderItems.product', 'name stock');

        return res.status(200).json({
            status: "success",
            statusCode: 200,
            count: orders.length,
            data: orders
        });
    } catch(error) {
        return res.status(500).json({
            status: "error",
            statusCode: 500,
            error: error.message
        });
    }
}

export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate('user', 'name email')
            .populate('orderItems.product', 'name stock');

        if (!order || (order.user.toString() !== req.user.id && req.user.role !== 'admin')) {
            return res.status(404).json({
                status: "error",
                statusCode: 404,
                message: 'Order not found or unauthorized'
            });
        }

        return res.status(200).json({
            status: "success",
            statusCode: 200,
            data: order
        });
    } catch(error) {
        return res.status(500).json({
            status: "error",
            statusCode: 500,
            error: error.message
        });
    }
}

export const updateOrderStatus = async (req, res) => {
    try {
        const { orderStatus, trackingNumber, courier } = req.body;
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                status: "error",
                statusCode: 404,
                message: "Order not found"
            });
        }

        if (req.user.role !== 'admin') {
            return res.status(403).json({
                status: "error",
                statusCode: 403,
                message: "Unauthorized"
            });
        }

        order.orderStatus = orderStatus || order.orderStatus;
        if (orderStatus === 'Delivered') order.deliveredAt = Date.now();
        order.trackingNumber = trackingNumber || order.trackingNumber;
        order.courier = courier || order.courier;

        await order.save();

        return res.status(200).json({
            status: "success",
            statusCode: 200,
            message: "Order status updated",
            data: order
        });
    } catch(error) {
        return res.status(500).json({
            status: "error",
            statusCode: 500,
            error: error.message
        });
    }
}

export const cancelOrder = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).json({
                status: "error",
                statusCode: 404,
                message: "Order not found"
            });
        }

        if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: "error",
                statusCode: 403,
                message: "Unauthorized"
            });
        }

        if (order.orderStatus === 'Delivered') {
            return res.status(400).json({
                status: "error",
                statusCode: 400,
                message: "Cannot cancel delivered order"
            });
        }

        order.orderStatus = 'Cancelled';
        await order.save();

        return res.status(200).json({
            status: "success",
            statusCode: 200,
            message: "Order cancelled",
            data: order
        });
    } catch(error) {
        return res.status(500).json({
            status: "error",
            statusCode: 500,
            error: error.message
        });
    }
}

export const getOrderStats = async (req, res) => {
    try {
        // Convert user ID to ObjectId if needed
        const userId = req.user.role === 'admin' ? null : mongoose.Types.ObjectId(req.user._id);

        const pipeline = [
            {
                $match: req.user.role === 'admin' ? {} : { user: userId }
            },
            {
                $facet: {
                    summaryStats: [
                        {
                            $group: {
                                _id: null,
                                totalOrders: { $sum: 1 },
                                totalRevenue: { $sum: "$totalPrice" },
                                avgOrderValue: { $avg: "$totalPrice" }
                            }
                        }
                    ],
                    statusStats: [
                        {
                            $group: {
                                _id: "$orderStatus",
                                count: { $sum: 1 },
                                revenue: { $sum: "$totalPrice" }
                            }
                        }
                    ],
                    recentOrders: [
                        { $sort: { createdAt: -1 } },
                        { $limit: 5 },
                        {
                            $project: {
                                _id: 1,
                                totalPrice: 1,
                                orderStatus: 1,
                                createdAt: 1
                            }
                        }
                    ]
                }
            }
        ];

        const results = await Order.aggregate(pipeline);

        // Format the response
        const response = {
            summary: results[0].summaryStats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                avgOrderValue: 0
            },
            byStatus: results[0].statusStats.reduce((acc, curr) => {
                acc[curr._id] = {
                    count: curr.count,
                    revenue: curr.revenue
                };
                return acc;
            }, {}),
            recentOrders: results[0].recentOrders
        };

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            data: response
        });

    } catch (error) {
        console.error('Order stats error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Failed to retrieve order statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};