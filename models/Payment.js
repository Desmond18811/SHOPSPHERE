import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: Number,
        required: true,
        default: 'NGN'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'bank_transfer', 'mobile_money', 'ussd'],
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'refunded'],
        default: 'pending'
    },
    transactionReference: {
        type: String,
        unique: true,
        required: true
    },
    authorizationCode: {
        type: String,
    },
    paymentDate: {
        type: Date,
        default: Date.now
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
    },
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

paymentSchema.pre('save', async function (next) {
    if(this.isModified('status') && this.status === 'success') {
        const order = await mongoose.model('Order').findById(this.order._id);
        if(order){
            order.paymentInfo.status = 'success';
            order.orderStatus = 'processing';
            await order.save({ validateBeforeSave: false});
        }
    }
    next();
})

export default mongoose.model('Payment', paymentSchema);
