import cloudinary from 'cloudinary';
import Store from '../models/Store.js';
import Products from '../models/Products.js';
import { sendManagerAlert } from '../config/email.js';
import mongoose from "mongoose";
import Order from "../models/Order.js";

export const createProduct = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found in request',
            });
        }

        const { name, description, price, discountPrice, color, size, category, stock, store } = req.body;

        if (!name || !description || !price || !discountPrice || !size || !category || !store) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Please fill in all required fields'
            });
        }

        // Validate store ID format
        if (!mongoose.Types.ObjectId.isValid(store)) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Invalid store ID format'
            });
        }

        const storeExists = await Store.findById(store);
        if (!storeExists || !storeExists.isActive) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Store not found or inactive'
            });
        }

        let product = await Products.findOne({ name, store });

        let images = [];
        if (req.files) {
            images = await Promise.all(
                req.files.map(async (file) => {
                    const result = await cloudinary.uploader.upload(file.path, {
                        folder: 'ecommerce/products',
                        transformation: [{ width: 500, height: 500, crop: 'limit' }],
                    });
                    return {
                        public_id: result.public_id,
                        url: result.secure_url
                    };
                })
            );
        }

        if (product) {
            product.stock += Number(stock);
            product.images = images.length ? images : product.images;
            product.description = description || product.description;
            product.price = price || product.price;
            product.discountPrice = discountPrice || product.discountPrice;
            product.color = color || product.color;
            product.size = size ? size.split(',') : product.size;
            product.category = category || product.category;
            await product.save();
        } else {
            product = await Products.create({
                name,
                description,
                price,
                discountPrice,
                color,
                size: size ? size.split(',') : [],
                category,
                stock,
                images,
                store,
                user: req.user.id
            });
        }

        if (product.stock <= 0) {
            await sendManagerAlert({
                email: storeExists.owner,
                subject: 'Product Out of stock',
                message: `The product ${product.name} in the store ${storeExists.name} is out of stock`,
            });
        }

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            message: 'Product successfully created',
            data: {
                id: product._id,
                name: product.name,
                description: product.description,
                price: product.price,
                discountPrice: product.discountPrice,
                color: product.color,
                size: product.size,
                category: product.category,
                stock: product.stock,
                images: product.images,
                store: product.store,
                user: product.user,
                createdAt: product.createdAt
            }
        });
    } catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const restockProduct = async (req, res) => {
    try {
        const { stock } = req.body;
        const product = await Products.findById(req.params.id);

        if (!product) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'We could not find the product',
            });
        }

        if (product.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: "Unauthorized access, must be an Administrator to increase product stock",
            });
        }

        product.stock += Number(stock);
        await product.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Product added successfully',
            data: {
                id: product._id,
                name: product.name,
                stock: product.stock
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

export const getAllProducts = async (req, res) => {
    try {
        const products = await Products.find()
            .populate('store', 'name address')
            .populate('user', 'name email address');

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            count: products.length,
            data: products.map(product => ({
                id: product._id,
                name: product.name,
                description: product.description,
                price: product.price,
                discountPrice: product.discountPrice,
                color: product.color,
                size: product.size,
                category: product.category,
                stock: product.stock,
                rating: product.rating,
                images: product.images,
                numOfReviews: product.numOfReviews,
                store: product.store,
                user: product.user,
                createdAt: product.createdAt
            }))
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const getProductsById = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id)
            .populate('store', 'name address')
            .populate('user', 'name email address')
            .populate('reviews.user', 'name email');

        if (!product) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'We could not find the product',
            });
        }

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Product found',
            data: {
                id: product._id,
                name: product.name,
                description: product.description,
                price: product.price,
                discountPrice: product.discountPrice,
                color: product.color,
                size: product.size,
                category: product.category,
                stock: product.stock,
                ratings: product.ratings,
                images: product.images,
                numOfReviews: product.numOfReviews,
                reviews: product.reviews,
                store: product.store,
                user: product.user,
                createdAt: product.createdAt,
            },
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const updateProduct = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authorized, user not found in request',
            });
        }

        const { name, description, price, discountPrice, color, size, category, stock } = req.body;
        const product = await Products.findById(req.params.id);

        if (!product) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'We could not find the product',
            });
        }

        if (product.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Unauthorized access, must be an Administrator to update product',
            });
        }

        let images = product.images;
        if (req.files) {
            // Remove old images from Cloudinary
            for (let image of product.images) {
                await cloudinary.uploader.destroy(image.public_id);
            }
            // Upload new images
            images = await Promise.all(
                req.files.map(async (file) => {
                    const result = await cloudinary.uploader.upload(file.path, {
                        folder: 'ecommerce/products',
                        transformation: [{ width: 500, height: 500, crop: 'limit' }],
                    });
                    return { public_id: result.public_id, url: result.secure_url };
                })
            );
        }

        const updatedProduct = await Products.findByIdAndUpdate(
            req.params.id,
            {
                name,
                description,
                price,
                discountPrice,
                color,
                size: size ? size.split(',') : product.size,
                category,
                stock: stock !== undefined ? Number(stock) : product.stock,
                images,
            },
            { new: true, runValidators: true }
        );

        if (updatedProduct.stock <= 0) {
            const store = await Store.findById(updatedProduct.store);
            await sendManagerAlert({
                email: store.ownerEmail,
                subject: 'Product out of stock',
                message: `The product "${updatedProduct.name}" in store "${store.name}" is out of stock.`,
            });
        }

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Product updated successfully',
            data: {
                id: updatedProduct._id,
                name: updatedProduct.name,
                description: updatedProduct.description,
                price: updatedProduct.price,
                discountPrice: updatedProduct.discountPrice,
                color: updatedProduct.color,
                size: updatedProduct.size,
                category: updatedProduct.category,
                stock: updatedProduct.stock,
                images: updatedProduct.images,
                store: updatedProduct.store,
                user: updatedProduct.user,
                createdAt: updatedProduct.createdAt,
            },
        });
    } catch (error) {
        console.error('updateProduct error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: error.message,
        });
    }
};

export const deleteProduct = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id);

        if (!product) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: "Product couldn't be found for deletion"
            });
        }

        if (product.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'User is not an admin so you cant delete the product',
            });
        }

        for (let image of product.images) {
            await cloudinary.uploader.destroy(image.public_id);
        }

        await product.deleteOne();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Product deleted successfully',
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const createProductReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const product = await Products.findById(req.params.id);

        if (!product) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Product not found'
            });
        }

        if (product.stock <= 0) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Cannot review a product that is out of stock',
            });
        }

        const alreadyReviewed = product.reviews.find(
            (review) => review.user.toString() === req.user.id
        );

        if (alreadyReviewed) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Product already reviewed',
            });
        }

        const review = {
            user: req.user.id,
            name: req.user.name,
            rating: Number(rating),
            comment: comment,
        };

        product.reviews.push(review);
        product.numOfReviews = product.reviews.length;
        await product.save();

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            message: 'Review successfully created',
        });
    } catch (error) {
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            error: error.message,
        });
    }
};

export const checkStockAvailability = async (req, res) => {
    try {
        const product = await Products.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Product not found'
            });
        }

        const isAvailable = product.stock > 0;
        const message = isAvailable ? 'Product is in stock' : 'Product is out of stock';

        if (!isAvailable) {
            const store = await Store.findById(product.store);
            await sendManagerAlert({
                email: store.owner,
                subject: 'product is out of stock',
                message: `the product ${product.name} in store ${product.store} is out, please restock`
            });
        }

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Stock availability checked',
            data: {
                id: product._id,
                name: product.name,
                rating: product.rating,
                stock: product.stock,
                isAvailable,
                message
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


export const createOrder = async (req, res) => {
    try {
        const {
            orderItems,
            shippingInfo,
            paymentInfo,
            itemsPrice,
            taxPrice,
            shippingPrice,
            totalPrice
        } = req.body;

        // Validate required fields
        if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'At least one order item is required'
            });
        }

        if (!shippingInfo || !shippingInfo.address || !shippingInfo.city ||
            !shippingInfo.state || !shippingInfo.country ||
            !shippingInfo.postalCode || !shippingInfo.phone) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'All shipping information fields are required'
            });
        }

        // Process each order item
        for (const item of orderItems) {
            const product = await Products.findById(item.product);

            if (!product) {
                return res.status(404).json({
                    status: 'error',
                    statusCode: 404,
                    message: `Product ${item.product} not found`
                });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({
                    status: 'error',
                    statusCode: 400,
                    message: `Only ${product.stock} available for product ${product.name}`
                });
            }
        }

        // Create order
        const order = new Order({
            user: req.user.id,
            orderItems,
            shippingInfo,
            paymentInfo: paymentInfo || {},
            itemsPrice: itemsPrice || 0,
            taxPrice: taxPrice || 0,
            shippingPrice: shippingPrice || 0,
            totalPrice: totalPrice || 0,
            orderStatus: 'Processing'
        });

        await order.save();

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            data: order
        });

    } catch (error) {
        console.error('Order creation error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Failed to create order',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};