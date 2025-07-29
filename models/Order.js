import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.ObjectId,
            ref: 'User',
            required: true,
        },
        orderItems: [
            {
                name: {
                    type: String,
                    required: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                },
                image: {
                    type: String,
                    required: true,
                },
                price: {
                    type: Number,
                    required: true,
                },
                product: {
                    type: mongoose.Schema.ObjectId,
                    ref: 'Product',
                    required: true,
                },
            },
        ],
        shippingInfo: {
            address: {
                type: String,
                required: true,
            },
            city: {
                type: String,
                required: true,
            },
            state: {
                type: String,
                required: true,
            },
            country: {
                type: String,
                required: true,
            },
            postalCode: {
                type: String,
                required: true,
            },
            phone: {
                type: String,
                required: true,
            },
        },
        paymentInfo: {
            id: {
                type: String,
            },
            status: {
                type: String,
            },
            reference: {
                type: String,
            },
            channel: {
                type: String,
            },
        },
        itemsPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        taxPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        shippingPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        totalPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        orderStatus: {
            type: String,
            required: true,
            default: 'Processing',
            enum: [
                'Processing',
                'Shipped',
                'In Transit',
                'Out for Delivery',
                'Delivered',
                'Cancelled',
            ],
        },
        deliveredAt: {
            type: Date,
        },
        trackingNumber: {
            type: String,
        },
        courier: {
            type: String,
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

// Update product stock when order is placed
orderSchema.pre('save', async function (next) {
    if (this.isModified('orderStatus') && this.orderStatus === 'Processing') {
        for (const item of this.orderItems) {
            const product = await mongoose.model('Product').findById(item.product);
            if (product) {
                product.stock -= item.quantity;
                await product.save({ validateBeforeSave: false });
            }
        }
    }
    next();
});

export default mongoose.model('Order', orderSchema);