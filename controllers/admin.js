const express = require("express");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cloudinary = require('../utils/cloudinaryConfig');
const sendMail = require("../utils/sendMail");
const sendToken = require("../utils/jwtToken");
const Admin = require("../model/admin");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const { upload } = require("../multere");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const sendAdminToken = require("../utils/adminToken");


router.post("/create-admin", upload.single("avatar"), catchAsyncErrors(async (req, res, next) => {
    try {
        // Extract the admin data from the request body
        const { name, email, password, phoneNumber } = req.body;

        // Check if an admin with the same email already exists
        const existingAdmin = await Admin.findOne({ email });

        if (existingAdmin) {
            return next(new ErrorHandler("Admin already exists", 400));
        }

        // Check if a file was uploaded
        if (!req.file) {
            return next(new ErrorHandler("No file uploaded", 400));
        }

        // Upload the avatar image to Cloudinary
        const avatarUploadResult = await cloudinary.uploader.upload(req.file.path);

        // Create a new admin user with the Cloudinary avatar URL
        const admin = new Admin({
            name,
            email,
            password,
            phoneNumber,
            avatar: avatarUploadResult.secure_url, // Use the secure URL from Cloudinary
        });

        // Save the new admin user to the database
        await admin.save();

        // Delete the file from the local upload folder
        fs.unlinkSync(req.file.path);

        // Return a response indicating success
        res.status(201).json({
            success: true,
            message: "Admin user created successfully",
        });
    } catch (error) {
        return next(new ErrorHandler(error.message, 500));
    }
}));


// login shop
router.post(
    "/login-admin",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { email, password } = req.body;

            const user = await Admin.findOne({ email }).select("+password");

            if (!user) {
                return next(new ErrorHandler("User doesn't exist!", 400));
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                return next(
                    new ErrorHandler("Please provide the correct information.", 400)
                );
            }

            sendAdminToken(user, 201, res);

        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);


router.get(
    "/logout",
    catchAsyncErrors(async (req, res, next) => {
        try {
            res.cookie("admin_token", null, {
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

module.exports = router;




