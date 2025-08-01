import Delivery from '../models/Delivery.js';
import Order from '../models/Order.js';
import Store from '../models/Store.js';
import axios from 'axios';
import mongoose from 'mongoose';

// Google Maps API configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Create a new delivery
 */
export const createDelivery = async (req, res) => {
    try {
        const { orderId } = req.params;

        // Validate order ID
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid order ID'
            });
        }

        // Find the order
        const order = await Order.findById(orderId)
            .populate('user', 'shippingInfo')
            .populate('orderItems.product', 'store');

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found'
            });
        }

        // Get store location (assuming first product's store is the pickup location)
        const storeId = order.orderItems[0]?.product?.store;
        if (!storeId) {
            return res.status(400).json({
                status: 'error',
                message: 'Order products must belong to a store'
            });
        }

        const store = await Store.findById(storeId);
        if (!store || !store.location?.coordinates) {
            return res.status(400).json({
                status: 'error',
                message: 'Store location not configured'
            });
        }

        // Prepare delivery locations
        const pickupLocation = {
            type: 'Point',
            coordinates: store.location.coordinates,
            address: store.address,
            city: store.location.city,
            state: store.location.state,
            country: store.location.country
        };

        const deliveryLocation = {
            type: 'Point',
            coordinates: [order.shippingInfo.longitude, order.shippingInfo.latitude],
            address: order.shippingInfo.address,
            city: order.shippingInfo.city,
            state: order.shippingInfo.state,
            country: order.shippingInfo.country
        };

        // Get route from Google Maps Directions API
        const directionsResponse = await axios.get(
            `https://maps.googleapis.com/maps/api/directions/json?` +
            `origin=${pickupLocation.coordinates[1]},${pickupLocation.coordinates[0]}` +
            `&destination=${deliveryLocation.coordinates[1]},${deliveryLocation.coordinates[0]}` +
            `&key=${GOOGLE_MAPS_API_KEY}`
        );

        if (directionsResponse.data.status !== 'OK') {
            return res.status(400).json({
                status: 'error',
                message: 'Could not calculate delivery route',
                googleMapsError: directionsResponse.data.status
            });
        }

        const route = directionsResponse.data.routes[0];
        const leg = route.legs[0];

        // Create delivery record
        const delivery = await Delivery.create({
            order: orderId,
            store: storeId,
            status: 'pending',
            pickupLocation,
            deliveryLocation,
            estimatedDeliveryTime: new Date(Date.now() + leg.duration.value * 1000),
            distance: leg.distance.value,
            duration: leg.duration.value,
            routePolyline: route.overview_polyline.points,
            createdBy: req.user.id,
            trackingUpdates: [{
                location: pickupLocation,
                status: 'pending',
                note: 'Delivery created'
            }]
        });

        return res.status(201).json({
            status: 'success',
            message: 'Delivery created',
            data: delivery
        });

    } catch (error) {
        console.error('Delivery creation error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to create delivery'
        });
    }
};

/**
 * Assign a courier to delivery
 */
export const assignCourier = async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const { courierId } = req.body;

        // Validate IDs
        if (!mongoose.isValidObjectId(deliveryId) || !mongoose.isValidObjectId(courierId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid delivery or courier ID'
            });
        }

        const delivery = await Delivery.findById(deliveryId);
        if (!delivery) {
            return res.status(404).json({
                status: 'error',
                message: 'Delivery not found'
            });
        }

        // Update delivery status and assign courier
        delivery.courier = courierId;
        delivery.status = 'assigned';
        delivery.trackingUpdates.push({
            location: delivery.pickupLocation,
            status: 'assigned',
            note: `Courier ${courierId} assigned`
        });

        await delivery.save();

        return res.status(200).json({
            status: 'success',
            message: 'Courier assigned to delivery',
            data: delivery
        });

    } catch (error) {
        console.error('Assign courier error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to assign courier'
        });
    }
};

/**
 * Update delivery status (for couriers)
 */
export const updateDeliveryStatus = async (req, res) => {
    try {
        const { deliveryId } = req.params;
        const { status, note, latitude, longitude } = req.body;

        if (!mongoose.isValidObjectId(deliveryId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid delivery ID'
            });
        }

        const delivery = await Delivery.findById(deliveryId);
        if (!delivery) {
            return res.status(404).json({
                status: 'error',
                message: 'Delivery not found'
            });
        }

        // Validate courier authorization
        if (delivery.courier.toString() !== req.user.id) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized to update this delivery'
            });
        }

        // Validate status transition
        const validTransitions = {
            assigned: ['picked_up'],
            picked_up: ['in_transit'],
            in_transit: ['delivered'],
            delivered: [],
            cancelled: []
        };

        if (!validTransitions[delivery.status]?.includes(status)) {
            return res.status(400).json({
                status: 'error',
                message: `Invalid status transition from ${delivery.status} to ${status}`
            });
        }

        // Update delivery
        delivery.status = status;

        if (status === 'delivered') {
            delivery.actualDeliveryTime = new Date();
        }

        delivery.trackingUpdates.push({
            location: {
                type: 'Point',
                coordinates: [longitude, latitude]
            },
            status,
            note: note || `Status updated to ${status}`
        });

        await delivery.save();

        return res.status(200).json({
            status: 'success',
            message: 'Delivery status updated',
            data: delivery
        });

    } catch (error) {
        console.error('Update delivery status error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to update delivery status'
        });
    }
};

/**
 * Get delivery tracking data
 */
export const trackDelivery = async (req, res) => {
    try {
        const { deliveryId } = req.params;

        if (!mongoose.isValidObjectId(deliveryId)) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid delivery ID'
            });
        }

        const delivery = await Delivery.findById(deliveryId)
            .populate('order', 'orderItems totalPrice')
            .populate('store', 'name address')
            .populate('courier', 'name phone');

        if (!delivery) {
            return res.status(404).json({
                status: 'error',
                message: 'Delivery not found'
            });
        }

        // Prepare response with optimized data for tracking
        const response = {
            status: delivery.status,
            pickupLocation: delivery.pickupLocation,
            deliveryLocation: delivery.deliveryLocation,
            routePolyline: delivery.routePolyline,
            estimatedDeliveryTime: delivery.estimatedDeliveryTime,
            actualDeliveryTime: delivery.actualDeliveryTime,
            trackingUpdates: delivery.trackingUpdates.map(update => ({
                timestamp: update.timestamp,
                location: update.location,
                status: update.status,
                note: update.note
            })),
            courier: delivery.courier,
            order: {
                id: delivery.order._id,
                totalPrice: delivery.order.totalPrice,
                itemCount: delivery.order.orderItems.length
            },
            store: {
                id: delivery.store._id,
                name: delivery.store.name,
                address: delivery.store.address
            }
        };

        return res.status(200).json({
            status: 'success',
            data: response
        });

    } catch (error) {
        console.error('Track delivery error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to track delivery'
        });
    }
};

/**
 * Get deliveries near a location (for courier assignment)
 */
export const getNearbyDeliveries = async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 5000 } = req.query; // maxDistance in meters

        if (!longitude || !latitude) {
            return res.status(400).json({
                status: 'error',
                message: 'Longitude and latitude are required'
            });
        }

        const deliveries = await Delivery.find({
            status: 'pending',
            pickupLocation: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            }
        }).populate('store', 'name address');

        return res.status(200).json({
            status: 'success',
            count: deliveries.length,
            data: deliveries
        });

    } catch (error) {
        console.error('Get nearby deliveries error:', error);
        return res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to get nearby deliveries'
        });
    }
};