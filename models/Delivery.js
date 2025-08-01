import mongoose from 'mongoose';

const deliverySchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    store: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Store',
        required: true
    },
    courier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'],
        default: 'pending'
    },
    pickupLocation: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        },
        address: String,
        city: String,
        state: String,
        country: String
    },
    deliveryLocation: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        },
        address: String,
        city: String,
        state: String,
        country: String
    },
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    distance: Number, // in meters
    duration: Number, // in seconds
    routePolyline: String, // Google Maps polyline
    trackingUpdates: [{
        timestamp: {
            type: Date,
            default: Date.now
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                required: true
            },
            coordinates: {
                type: [Number],
                required: true
            }
        },
        status: String,
        note: String
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for geospatial queries
deliverySchema.index({ pickupLocation: '2dsphere' });
deliverySchema.index({ deliveryLocation: '2dsphere' });
deliverySchema.index({ 'trackingUpdates.location': '2dsphere' });

export default mongoose.model('Delivery', deliverySchema);