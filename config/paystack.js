import Paystack from 'paystack-node';
import dotenv from 'dotenv'
import {PAYSTACK_SECRET_KEY} from "./env.js";

dotenv.config()

const paystack = new Paystack(PAYSTACK_SECRET_KEY)

export default paystack
