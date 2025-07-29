import mongoose from "mongoose";
import Products from "../models/Products.js";
import Cart from "../models/Cart.js";
import Order from "../models/Order.js";
import Store from "../models/Store.js";
import { sendManagerAlert } from '../config/email.js';

export const addToCart = async (req, res) => {
    try {
        const { productId } = req.params; // Get productId from URL params
        const { quantity } = req.body;

        // Validate input
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Invalid product ID format'
            });
        }

        if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Quantity must be a positive integer'
            });
        }

        // Get product with necessary fields
        const product = await Products.findById(productId)
            .select('name price stock images store');

        if (!product) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Product not found.'
            });
        }

        if (product.stock < quantity) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: `Only ${product.stock} available`
            });
        }

        let cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            cart = await Cart.create({
                user: req.user.id,
                items: []
            });
        }

        const existingItem = cart.items.find(item =>
            item.product && item.product.toString() === productId.toString()
        );

        if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            if (product.stock < newQuantity) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Only ${product.stock - existingItem.quantity} available`
                });
            }
            existingItem.quantity = newQuantity;
        } else {
            // Ensure all required fields are provided
            const newItem = {
                product: product._id,  // Fixed typo: was 'prodcut'
                name: product.name,
                quantity: quantity,
                price: product.price,
                image: product.images[0]?.url || '/default-product-image.jpg'
            };

            // Validate the new item matches schema requirements
            if (!newItem.product || !newItem.image) {
                throw new Error('Missing required cart item fields');
            }

            cart.items.push(newItem);
        }

        // Explicitly update totals to match schema
        cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.updatedAt = new Date();

        await cart.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Added to cart',
            data: {
                totalItems: cart.totalItems,
                totalPrice: cart.totalPrice,
                items: cart.items.map(item => ({
                    productId: item.product,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    image: item.image
                }))
            }
        });
    } catch (error) {
        console.error('Cart error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message
        });
    }
};

export const updateCartItems = async (req, res) => {
    try {
        const { productId } = req.params; // Changed from req.body to req.params
        const { quantity } = req.body;

        // Validate inputs
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Invalid product ID format'
            });
        }

        if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Quantity must be a positive integer'
            });
        }

        const cart = await Cart.findOne({ user: req.user.id });
        if (!cart) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(item =>
            item.product && item.product.toString() === productId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Item not found in cart'
            });
        }

        const product = await Products.findById(productId);
        if (!product) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Product not found'
            });
        }

        if (product.stock < quantity) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: `Only ${product.stock} available`,
                availableStock: product.stock,
                requestedQuantity: quantity
            });
        }

        // Update the item quantity
        cart.items[itemIndex].quantity = quantity;

        // Recalculate totals
        cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        cart.totalPrice = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cart.updatedAt = new Date();

        await cart.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Cart updated successfully',
            data: {
                totalItems: cart.totalItems,
                totalPrice: cart.totalPrice,
                items: cart.items.map(item => ({
                    productId: item.product,
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    image: item.image
                }))
            }
        });
    } catch (error) {
        console.error('Update cart error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;
        const cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

        if (itemIndex === -1) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Item not found in cart'
            });
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Item removed',
            data: {
                totalItems: cart.items.reduce((sum, item) => sum + item.quantity, 0),
                totalPrice: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
                items: cart.items
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const clearCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user.id });

        if (!cart) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Cart not found'
            });
        }

        cart.items = [];
        await cart.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Cart cleared',
            data: {
                totalItems: 0,
                totalPrice: 0,
                items: []
            }
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const getCart = async (req, res) => {
    try {
        // Find cart and populate product details
        const cart = await Cart.findOne({ user: req.user.id })
            .populate({
                path: 'items.product',
                select: 'name stock images price store',
                populate: {
                    path: 'store',
                    select: 'name'
                }
            });

        // If no cart exists or cart is empty
        if (!cart || cart.items.length === 0) {
            return res.status(200).json({
                status: 'success',
                statusCode: 200,
                message: 'Cart is empty',
                data: {
                    cartId: cart?._id || null,
                    totalItems: 0,
                    totalPrice: 0,
                    items: []
                }
            });
        }

        // Calculate totals
        const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.items.reduce((sum, item) => {
            // Use product price if available, otherwise fall back to item price
            const price = item.product?.price || item.price;
            return sum + (price * item.quantity);
        }, 0);

        // Format response items
        const formattedItems = cart.items.map(item => ({
            productId: item.product?._id || item.product,
            name: item.product?.name || item.name,
            quantity: item.quantity,
            price: item.product?.price || item.price,
            image: item.product?.images[0]?.url || item.image,
            stock: item.product?.stock,
            store: item.product?.store ? {
                storeId: item.product.store._id,
                storeName: item.product.store.name
            } : null
        }));

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Cart retrieved successfully',
            data: {
                cartId: cart._id,
                totalItems,
                totalPrice,
                items: formattedItems
            }
        });
    } catch (error) {
        console.error('Get cart error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Failed to retrieve cart',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}


export const checkout = async (req, res) => {
    try {
        const { shippingInfo, saveCard } = req.body;
        const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');

        // Validate cart exists and has items
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Cart is empty'
            });
        }

        // Validate shipping info
        const requiredShippingFields = ['address', 'city', 'state', 'country', 'postalCode', 'phone'];
        for (const field of requiredShippingFields) {
            if (!shippingInfo[field]) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Missing required shipping field: ${field}`
                });
            }
        }

        // Prepare order items with fallback values
        const orderItems = cart.items.map(item => {
            if (!item.product) {
                throw new Error(`Product not found for cart item`);
            }
            if (item.product.stock < item.quantity) {
                throw new Error(`Insufficient stock for ${item.product.name}`);
            }

            return {
                name: item.product.name || 'Unnamed Product',
                quantity: item.quantity,
                image: item.product.images[0]?.url || '/default-product.jpg',
                price: item.product.price,
                product: item.product._id
            };
        });

        // Calculate totals
        const itemsPrice = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalPrice = itemsPrice; // Can add shipping/tax here later

        // Create and save order
        const order = new Order({
            user: req.user.id,
            orderItems,
            shippingInfo,
            itemsPrice,
            totalPrice,
            orderStatus: 'Processing',
            paymentMethod: req.body.paymentMethod?.type || 'unpaid'
        });

        await order.save();

        // Update product stock
        for (const item of cart.items) {
            await Products.findByIdAndUpdate(
                item.product._id,
                { $inc: { stock: -item.quantity } },
                { new: true }
            );
        }

        // Clear cart
        await Cart.findByIdAndUpdate(cart._id, { items: [], totalItems: 0, totalPrice: 0 });

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Checkout completed successfully',
            data: {
                orderId: order._id,
                totalAmount: totalPrice,
                items: orderItems.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price
                }))
            }
        });

    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Checkout processing failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};