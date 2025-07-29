import mongoose from 'mongoose';
import Store from '../models/Store.js';
import { sendManagerAlert } from '../config/email.js';

// Create a new store
export const createStore = async (req, res, next) => {
    try {
        const { name, description, address, categories, location } = req.body;
        const { logo, banner } = req.files || {};


        const owner = req.user.id
        // Validate required fields
        if (!name || !description || !address || !owner) {
            return res.status(400).json({
                status: 'error',
                statusCode: 400,
                message: 'Missing required fields (name, description, address, or owner)',
            });
        }

        let logoData = {};
        let bannerData = {};
        if (logo) {
            const logoResult = await cloudinary.uploader.upload(logo[0].path, {
                folder: 'ecommerce/stores/logos',
                transformation: [{ width: 200, height: 200, crop: 'limit' }],
            });
            logoData = { public_id: logoResult.public_id, url: logoResult.secure_url };
        }
        if (banner) {
            const bannerResult = await cloudinary.uploader.upload(banner[0].path, {
                folder: 'ecommerce/stores/banners',
                transformation: [{ width: 1200, height: 400, crop: 'limit' }],
            });
            bannerData = { public_id: bannerResult.public_id, url: bannerResult.secure_url };
        }

        const store = await Store.create({
            name,
            description,
            logo: logoData,
            banner: bannerData,
            categories: categories || [],
            address,
            location: {
                type: 'Point',
                coordinates: location?.coordinates || [],
                formattedAddress: location?.formattedAddress,
                street: location?.street,
                city: location?.city,
                state: location?.state,
                zipcode: location?.zipcode,
                country: location?.country,
            },
            owner,
        });

        return res.status(201).json({
            status: 'success',
            statusCode: 201,
            message: 'Store created successfully',
            data: {
                id: store._id,
                name: store.name,
                description: store.description,
                logo: store.logo,
                banner: store.banner,
                categories: store.categories,
                address: store.address,
                location: store.location,
                owner: store.owner,
                isActive: store.isActive,
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

// Get all stores
export const getAllStores = async (req, res, next) => {
    try {
        const stores = await Store.find()
            .populate('owner', 'name email')
            .populate('products', 'name stock');

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            count: stores.length,
            data: stores.map(store => ({
                id: store._id,
                name: store.name,
                description: store.description,
                logo: store.logo,
                banner: store.banner,
                categories: store.categories,
                address: store.address,
                location: store.location,
                owner: store.owner,
                isActive: store.isActive,
                products: store.products,
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

// Get store by ID
export const getStoreById = async (req, res, next) => {
    try {
        const store = await Store.findById(req.params.id)
            .populate('owner', 'name email')
            .populate('products', 'name stock');

        if (!store) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Store not found',
            });
        }

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            data: {
                id: store._id,
                name: store.name,
                description: store.description,
                logo: store.logo,
                banner: store.banner,
                categories: store.categories,
                address: store.address,
                location: store.location,
                owner: store.owner,
                isActive: store.isActive,
                products: store.products,
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
// Update store details
export const updateStore = async (req, res, next) => {
    try {
        // First check if user is authenticated
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authenticated',
            });
        }

        const { name, description, address, categories, location } = req.body;
        const { logo, banner } = req.files || {};
        const store = await Store.findById(req.params.id);

        if (!store) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Store not found',
            });
        }

        // Check ownership or admin role
        if (store.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({  // 403 Forbidden is more appropriate
                status: 'error',
                statusCode: 403,
                message: 'Unauthorized to update this store',
            });
        }

        // Handle logo update
        if (logo) {
            try {
                if (store.logo?.public_id) {
                    await cloudinary.uploader.destroy(store.logo.public_id);
                }
                const logoResult = await cloudinary.uploader.upload(logo[0].path, {
                    folder: 'ecommerce/stores/logos',
                    transformation: [{ width: 200, height: 200, crop: 'limit' }],
                });
                store.logo = {
                    public_id: logoResult.public_id,
                    url: logoResult.secure_url
                };
            } catch (cloudinaryError) {
                console.error('Logo upload error:', cloudinaryError);
                return res.status(500).json({
                    status: 'error',
                    statusCode: 500,
                    message: 'Failed to update logo',
                });
            }
        }

        // Handle banner update
        if (banner) {
            try {
                if (store.banner?.public_id) {
                    await cloudinary.uploader.destroy(store.banner.public_id);
                }
                const bannerResult = await cloudinary.uploader.upload(banner[0].path, {
                    folder: 'ecommerce/stores/banners',
                    transformation: [{ width: 1200, height: 400, crop: 'limit' }],
                });
                store.banner = {
                    public_id: bannerResult.public_id,
                    url: bannerResult.secure_url
                };
            } catch (cloudinaryError) {
                console.error('Banner upload error:', cloudinaryError);
                return res.status(500).json({
                    status: 'error',
                    statusCode: 500,
                    message: 'Failed to update banner',
                });
            }
        }

        // Update other fields
        if (name) store.name = name;
        if (description) store.description = description;
        if (address) store.address = address;
        if (categories) store.categories = categories;
        if (location) store.location = location;

        const updatedStore = await store.save();

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Store updated successfully',
            data: {
                id: updatedStore._id,
                name: updatedStore.name,
                description: updatedStore.description,
                logo: updatedStore.logo,
                banner: updatedStore.banner,
                categories: updatedStore.categories,
                address: updatedStore.address,
                location: updatedStore.location,
                owner: updatedStore.owner,
                isActive: updatedStore.isActive,
            },
        });
    } catch (error) {
        console.error('Update store error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Internal server error',
        });
    }
};

// Delete store
export const deleteStore = async (req, res, next) => {
    try {
        // First check if user is authenticated
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                status: 'error',
                statusCode: 401,
                message: 'Not authenticated',
            });
        }

        const store = await Store.findById(req.params.id);

        if (!store) {
            return res.status(404).json({
                status: 'error',
                statusCode: 404,
                message: 'Store not found',
            });
        }

        // Check ownership or admin role
        if (store.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                status: 'error',
                statusCode: 403,
                message: 'Unauthorized to delete this store',
            });
        }

        // Delete images from Cloudinary
        try {
            if (store.logo?.public_id) {
                await cloudinary.uploader.destroy(store.logo.public_id);
            }
            if (store.banner?.public_id) {
                await cloudinary.uploader.destroy(store.banner.public_id);
            }
        } catch (cloudinaryError) {
            console.error('Cloudinary deletion error:', cloudinaryError);
            // Continue with store deletion even if image deletion fails
        }

        await Store.deleteOne({ _id: req.params.id });

        return res.status(200).json({
            status: 'success',
            statusCode: 200,
            message: 'Store deleted successfully',
        });
    } catch (error) {
        console.error('Delete store error:', error);
        return res.status(500).json({
            status: 'error',
            statusCode: 500,
            message: 'Internal server error',
        });
    }
};