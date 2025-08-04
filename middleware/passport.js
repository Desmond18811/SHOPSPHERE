import passport from 'middleware/passport.js'
import User from "../models/User.js";
import {Strategy as LocalStrategy} from "passport-local";
import {ExtractJwt, Strategy as JwtStrategy} from "passport-jwt";
import {JWT_SECRET} from "../config/env.js";

passport.use(
    new LocalStrategy(
        {
            _usernameField: 'email',
            passwordField: 'password'
        },
        async (username, password, done) =>{
            try{
                //find users
                const user = await User.findOne({email}).select("+password");

                //if we can't find the user
                if(!user){
                    return done(null, false, {message: "User not found"});
                }
                //Check if password matches
                const isMatch = await User.matchPassword(password)
                if(!isMatch){
                    return done(null, false, {message: "User's does not match"});
                }
                return done(null, user);
            }catch(error){
                return done(error)
            }
        }
    )
)

//JWT strategy for protected routes

const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: JWT_SECRET
}

passport.use(
    new JwtStrategy(jwtOptions, async (payload, done) =>{
        try{
            const user = await User.findById(payload.userId)
            if(user) {
                return done(null, user);
            }
            return done(null, false);
        }catch(error){
            return done(error, false);
        }
    })
)

export default passport