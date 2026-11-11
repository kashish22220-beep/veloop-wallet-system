
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { runInTransaction } = require('../utils/transaction');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        if (!email || profile._json?.email_verified !== true) {
          return done(null, false);
        }

        let user = await User.findOne({
          $or: [{ googleId: profile.id }, { email }],
        });

        if (user) {
          if (user.googleId && user.googleId !== profile.id) {
            return done(null, false);
          }

          if (user.accountStatus !== 'active') {
            return done(null, false);
          }

          if (!user.googleId) {
            user.googleId = profile.id;
            user.isVerified = true;
            await user.save();
          }

          return done(null, user);
        }

        user = await runInTransaction(null, async (session) => {
          const [newUser] = await User.create(
            [{
              name: profile.displayName || email.split('@')[0],
              email,
              googleId: profile.id,
              isVerified: true,
            }],
            { session }
          );

          await Wallet.create([{ userId: newUser._id }], { session });
          return newUser;
        });

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);

module.exports = passport;
