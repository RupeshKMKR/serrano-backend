const express = require("express");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cloudinary = require('../utils/cloudinaryConfig');
const sendMail = require("../utils/sendMail");
const sendToken = require("../utils/jwtToken");
const Admin = require("../model/admin");
const Product = require("../model/product");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const { upload } = require("../multere");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const sendAdminToken = require("../utils/adminToken");
const bcrypt = require("bcryptjs");



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


// update shop profile picture
router.put(
    "/update-admin-avatar",
    isAdmin,
    upload.single("avatar"),
    catchAsyncErrors(async (req, res, next) => {
        try {
            // Find the admin by ID
            const admin = await Admin.findById(req.admin._id);

            if (!admin) {
                return next(new ErrorHandler("Admin not found", 404));
            }

            // Delete the existing avatar on Cloudinary
            if (admin.avatar) {
                const publicId = admin.avatar.split('/').slice(-1)[0].split('.')[0];
                await cloudinary.uploader.destroy(publicId);
            }

            // Upload the new avatar image to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path);

            // Update the admin's avatar with the Cloudinary URL
            admin.avatar = result.secure_url;
            await admin.save();

            // Delete the temporary file from the local upload folder
            fs.unlinkSync(req.file.path);

            res.status(200).json({
                success: true,
                admin,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// Update specific fields in the admin's profile (name, email, phoneNumber)
router.put(
    "/update-admin-profile",
    isAdmin,
    catchAsyncErrors(async (req, res, next) => {
        try {
            // Find the admin by ID
            const admin = await Admin.findById(req.admin._id);

            if (!admin) {
                return next(new ErrorHandler("Admin not found", 404));
            }

            // Update specific fields from the request body (name, email, phoneNumber)
            if (req.body.name) {
                admin.name = req.body.name;
            }
            if (req.body.email) {
                admin.email = req.body.email;
            }
            if (req.body.phoneNumber) {
                admin.phoneNumber = req.body.phoneNumber;
            }

            // Save the updated admin profile
            await admin.save();

            // Return a response indicating success
            res.status(200).json({
                success: true,
                admin,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);


router.put(
    "/change-password",
    isAdmin,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const admin = await Admin.findById(req.admin.id).select("+password");
            const isPasswordMatched = await admin.comparePassword(
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
            admin.password = req.body.newPassword;

            await admin.save();

            res.status(200).json({
                success: true,
                message: "Password updated successfully!",
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// Generate a reset token and send a reset email
router.post("/forgot-password", async (req, res, next) => {
    try {
        const email = req.body.email;

        // Find the admin with the provided email
        const admin = await Admin.findOne({ email });

        if (!admin) {
            throw new ErrorHandler("Admin not found", 404);
        }

        // Generate a reset token with an expiration time (e.g., 5 minutes)
        const activationToken = createActivationToken(admin);
        console.log("activationToken", activationToken);
        const resetLink = `http://localhost:3000/reset-password/${activationToken}`;

        try {
            await sendMail({
                email: email,
                subject: "Password Reset",
                message: `Click the following link to reset your password: ${resetLink}`,
            });
            res.status(201).json({
                success: true,
                message: `Please check your email (${email}) to reset your password.`,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    } catch (error) {
        next(error);
    }
});

// Create activation token
const createActivationToken = (admin) => {
    // Convert the admin object to a plain JavaScript object
    const adminObject = admin.toObject();

    return jwt.sign(adminObject, process.env.ACTIVATION_SECRET, {
        expiresIn: "5m",
    });
};

// Reset password route
router.post("/reset-password", async (req, res, next) => {
    try {
        const { token, newPassword, confirmPassword } = req.body;

        // Check if both newPassword and confirmPassword match
        if (newPassword !== confirmPassword) {
            throw new ErrorHandler("Passwords do not match", 400);
        }

        // Verify the reset token
        const decodedToken = jwt.verify(token, process.env.ACTIVATION_SECRET);

        if (!decodedToken) {
            throw new ErrorHandler("Invalid or expired token", 400);
        }

        // Find the admin using the reset token (admin ID)
        const admin = await Admin.findById(decodedToken._id);

        if (!admin) {
            throw new ErrorHandler("Admin not found", 404);
        }

        // Update the admin's password
        admin.password = newPassword;

        // Clear the reset token and reset password time
        admin.resetPasswordToken = undefined;
        admin.resetPasswordTime = undefined;

        // Save the updated admin object
        await admin.save();

        res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    } catch (error) {
        next(error);
    }
});


router.post(
    '/create-product',
    isAdmin,
    upload.array('images', 5),
    catchAsyncErrors(async (req, res, next) => { // Use catchAsyncErrors here
        try {
            // Extract product data from the request body
            const { name, description, category, originalPrice, discountPrice, stock } = req.body;

            // Extract image URLs from the uploaded files
            const imageUrls = [];
            for (const image of req.files) {
                // Upload each image to Cloudinary and store the secure URL
                const result = await cloudinary.uploader.upload(image.path);
                imageUrls.push(result.secure_url);

                // Delete the uploaded file from the local upload folder
                fs.unlinkSync(image.path);
            }

            // Create a new product instance with image URLs
            const newProduct = new Product({
                name,
                description,
                category,
                originalPrice,
                discountPrice,
                stock,
                images: imageUrls,
                // Other relevant fields
            });

            // Save the new product to the database
            const savedProduct = await newProduct.save();

            // Return a success response with the created product
            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                product: savedProduct,
            });
        } catch (error) {
            // Handle errors using the custom error handler
            console.error(error);

            // Delete uploaded files from the local upload folder on error
            for (const image of req.files) {
                fs.unlinkSync(image.path);
            }

            // Use the custom ErrorHandler to handle the error
            return next(new ErrorHandler(error.message, 500));
        }
    })
);


// all products --- for admin
router.get(
    "/admin-all-products",
    isAdmin,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const products = await Product.find().sort({
                createdAt: -1,
            });
            res.status(201).json({
                success: true,
                products,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

module.exports = router;




