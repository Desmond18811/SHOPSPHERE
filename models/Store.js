import mongoose from 'mongoose';

const storeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please add a store.js name'],
            unique: true,
            trim: true,
            maxlength: [50, 'Store name cannot exceed 50 characters'],
        },
        description: {
            type: String,
            required: [true, 'Please add a store.js description'],
        },
        logo: {
            public_id: {
                type: String,
            },
            url: {
                type: String,
            },
        },
        banner: {
            public_id: {
                type: String,
            },
            url: {
                type: String,
            },
        },
        categories: [
            {
                type: String,
                enum: [
                    'Electronics',
                    'Laptops',
                    'Phones',
                    'Home Appliances',
                    'Kitchen',
                    'Furniture',
                    'Clothing',
                    'Beauty',
                    'Sports',
                    'Other',
                ],
            },
        ],
        address: {
            type: String,
            required: [true, 'Please add an address'],
        },
        location: {
            // GeoJSON Point
            type: {
                type: String,
                enum: ['Point'],
            },
            coordinates: {
                type: [Number],
                index: '2dsphere',
            },
            formattedAddress: String,
            street: String,
            city: String,
            state: String,
            zipcode: String,
            country: String,
        },
        owner: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Reversely populate with virtual
storeSchema.virtual('products', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'store',
    justOne: false,
});

export default mongoose.model('Store', storeSchema);