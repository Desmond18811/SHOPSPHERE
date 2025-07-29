import mongoose from "mongoose";

const productSchema  = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please input the name of a product'],
        trim: true,
        maxLength: [100, 'Product name should not be more than 100 characters']
    },
    description: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: [true, 'Please input a price for the product'],
        maxLength: [8, 'Price must not exceed right characters']
    },
    discountPrice: {
        type: Number,
        maxLength: [8, 'Price must not exceed right characters']
    },
    color: {
        type: String
    },
    size: {
        type: [String]
    },
    ratings: {
        type: Number,
        default: 0
    },
    images: [
        {
            public_id: {
                type: String,
                required: true
            },
            url: {
                type: String,
                required: true
            }
        }
    ],
    category: {
        type: String,
        required: [true, 'Please select a category for the product'],
        enum: {
            values:
                ['Electronics',
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
            message: 'Please select a correct category for product'
        }
    },
    stock: {
        type: Number,
        required: [true, 'Please add product stock'],
        maxLength: [5, 'Stock cannot exceed 5 characters'],
        default: 0
    },
    numOfReviews: {
        type: Number,
        default: 0
    },
    reviews: [
        {
            user: {
                type: mongoose.Schema.ObjectId,
                ref: 'User',
                required: true
            },
            name: {
                type: String,
                required: true
            },
            rating: {
                type: Number,
                required: true
            },
            comment: {
                type: String,
                required: true
            }
        }
    ],
    store: {
        type: mongoose.Schema.ObjectId,
        ref: 'Store',
        required: true
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    },
},
    {
        toJSON: {virtuals: true},
        toObject: {virtuals: true},
    }
)

productSchema.statics.getAverageRating = async  function (productId){
    const obj  =await this.aggregate([
        {
            $match : {_id: productId}
        },
        {
            $unwind: '$reviews'
        },
        {
            $group: {
                _id: '$_id',
                averageRating: { $avg: '$review_rating'}
            }
        }
    ])

    try {
        await this.model('Product').findByIdAndUpdate(productId,{
            rating: obj[0] ? obj[0].averageRating : 0
        })
    }catch(err){
        console.error(err)
    }
}

productSchema.post('save', function() {
    this.constructor.getAverageRating(this._id)
})

productSchema.post('remove', function (){
    this.constructor.getAverage(this._id)
})

export default mongoose.model('Product', productSchema)