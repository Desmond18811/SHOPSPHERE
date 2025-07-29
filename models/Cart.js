import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [{
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        name: {
            type: String,
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true,
        },
        image: {
            type: String,
            required: true,
        }
    }
],
    totalItems: {
        type: Number,
        default: 0,
        required: true,
    },
    totalPrice: {
        type: Number,
        default: 0.0,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
     updatedAt: {
        type: Date,
         default: Date.now
     },
},
    {
        toJSON: {virtuals: true},
        toObject: {virtuals: true},
    });

cartSchema.pre('save', async function (next) {
    this.totalItems = this.items.length;
    this.totalPrice = this.items.reduce((sum, item) => sum + item.price * item.quanity, 0);
    this.updatedAt = Date.now();
    next()
})

cartSchema.index({ user: 1 }, { unique: true });

export default mongoose.model('Cart', cartSchema);