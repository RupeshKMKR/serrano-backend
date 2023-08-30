const express = require("express");
const path = require('path');
const User = require("../model/user");
const router = express.Router();
const upload = require('../multer');
const ErrorHandler = require("../utils/ErrorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const fs = require('fs');
const cloudinary = require('../utils/cloudinaryConfig')
const jwt = require("jsonwebtoken");
const sendToken = require("../utils/jwtToken");
const { isAuthenticated, isAdmin } = require("../middleware/auth");





router.post("/login-user", async (req, res, next) => {
    try {
        const { phoneNumber, password } = req.body;

        let user = await User.findOne({ phoneNumber });

        // if (user) {
        //     return next(new ErrorHandler("User already exists", 400));
        // }
        if (!user) {
            user = await User.create({
                phoneNumber,
                password,
            });
        } else {

            user.phoneNumber = phoneNumber;
            user.password = password;

            await user.save();
        }

        sendToken(user, 201, res);
    } catch (error) {
        return next(new ErrorHandler(error.message, 500));
    }
});


router.put('/update-user-info',
    isAuthenticated,
    catchAsyncErrors(async (req, res) => {
        try {
            const userId = req.user._id;
            const { name, email } = req.body;
            const updatedFields = { name: name, email: email };
            const updatedUser = await User.findByIdAndUpdate(userId, updatedFields, { new: true });

            if (!updatedUser) {
                return next(new ErrorHandler("User doesn't exists", 400));
            }

            res.json({ message: 'Profile updated successfully', user: updatedUser });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    }));



// routes/auth.js
// Add the fs module for file operations

// routes/auth.js

// Profile Update
router.put('/profile-picture', isAuthenticated, upload.single('profileImage'), catchAsyncErrors(async (req, res, next) => {
    try {
        const { userId } = req.body;

        let user = await User.findById(userId);
        console.log("user", user);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Delete old image from Cloudinary
        if (user.profileImage && user.profileImage.publicId) {
            await cloudinary.uploader.destroy(user.profileImage.publicId);
        }

        // Upload new image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path);

        user.profileImage = {
            publicId: result.public_id,
            url: result.secure_url,
        };

        // Delete old image file from local upload folder
        fs.unlinkSync(req.file.path);

        await user.save();

        res.status(200).json({ message: 'Profile image uploaded successfully', user });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}));



// activate user
router.get(
    "/logout",
    catchAsyncErrors(async (req, res, next) => {
        try {
            res.cookie("token", null, {
                expires: new Date(Date.now()),
                httpOnly: true,
            });
            res.status(201).json({
                success: true,
                message: "Log out successful!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

router.get(
    "/getuser",
    isAuthenticated,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const userId = req.user._id;
            const user = await User.findById(userId);

            if (!user) {
                return next(new ErrorHandler("User doesn't exists", 400));
            }

            res.status(200).json({
                success: true,
                user,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);




// update user addresses
router.put(
    "/update-user-addresses",
    isAuthenticated,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const user = await User.findById(req.user.id);

            const sameTypeAddress = user.addresses.find(
                (address) => address.addressType === req.body.addressType
            );
            if (sameTypeAddress) {
                return next(
                    new ErrorHandler(`${req.body.addressType} address already exists`)
                );
            }

            const existsAddress = user.addresses.find(
                (address) => address._id === req.body._id
            );

            if (existsAddress) {
                Object.assign(existsAddress, req.body);
            } else {
                // add the new address to the array
                user.addresses.push(req.body);
            }

            await user.save();

            res.status(200).json({
                success: true,
                user,
            });
            console.log("user", user.addresses);
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// delete user address
router.delete(
    "/delete-user-address/:id",
    isAuthenticated,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const userId = req.user._id;
            const addressId = req.params.id;

            console.log(addressId);

            await User.updateOne(
                {
                    _id: userId,
                },
                { $pull: { addresses: { _id: addressId } } }
            );

            const user = await User.findById(userId);

            res.status(200).json({ success: true, user });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update user password
router.put(
    "/update-user-password",
    isAuthenticated,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const user = await User.findById(req.user.id).select("+password");

            const isPasswordMatched = await user.comparePassword(
                req.body.oldPassword
            );

            if (!isPasswordMatched) {
                return next(new ErrorHandler("Old password is incorrect!", 400));
            }

            if (req.body.newPassword !== req.body.confirmPassword) {
                return next(
                    new ErrorHandler("Password doesn't matched with each other!", 400)
                );
            }
            user.password = req.body.newPassword;

            await user.save();

            res.status(200).json({
                success: true,
                message: "Password updated successfully!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// find user infoormation with the userId
router.get(
    "/user-info/:id",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const user = await User.findById(req.params.id);

            res.status(201).json({
                success: true,
                user,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// all users --- for admin
router.get(
    "/admin-all-users",
    isAuthenticated,
    isAdmin("Admin"),
    catchAsyncErrors(async (req, res, next) => {
        try {
            const users = await User.find().sort({
                createdAt: -1,
            });
            res.status(201).json({
                success: true,
                users,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// delete users --- admin
router.delete(
    "/delete-user/:id",
    isAuthenticated,
    isAdmin("user"),
    catchAsyncErrors(async (req, res, next) => {
        console.log("req.body", req.params.id);

        try {
            console.log("req.body", req.body);
            const user = await User.findById(req.params.id);

            if (!user) {
                return next(
                    new ErrorHandler("User is not available with this id", 400)
                );
            }

            await User.findByIdAndDelete(req.params.id);

            res.status(201).json({
                success: true,
                message: "User deleted successfully!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

module.exports = router;
