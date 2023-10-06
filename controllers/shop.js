const express = require("express");
const path = require("path");
const router = express.Router();
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cloudinary = require('../utils/cloudinaryConfig');
const sendMail = require("../utils/sendMail");
const sendToken = require("../utils/jwtToken");
const Shop = require("../model/shop");
const { isAuthenticated, isSeller, isAdmin } = require("../middleware/auth");
const { upload } = require("../multere");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const ErrorHandler = require("../utils/ErrorHandler");
const sendShopToken = require("../utils/shopToken");

// create shop
router.post(
    "/create-shop",
    upload.fields([
        { name: 'avatar', maxCount: 1 },
        { name: 'aadharCard', maxCount: 1 },
        { name: 'panCard', maxCount: 1 },
        { name: 'shopLicense', maxCount: 1 }
    ]),
    async (req, res, next) => {
        console.log("email", req.body);
        try {
            const { email } = req.body;
            const sellerEmail = await Shop.findOne({ email });
            if (sellerEmail) {
                // Delete uploaded files
                const filesToDelete = [
                    req.files['avatar'][0].path,
                    req.files['aadharCard'][0].path,
                    req.files['panCard'][0].path,
                    req.files['shopLicense'][0].path
                ];
                filesToDelete.forEach(filePath => {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.log(err);
                        }
                    });
                });

                return next(new ErrorHandler("User already exists", 400));
            }

            // Upload images to Cloudinary
            const avatarUpload = await cloudinary.uploader.upload(req.files['avatar'][0].path);
            const aadharCardUpload = await cloudinary.uploader.upload(req.files['aadharCard'][0].path);
            const panCardUpload = await cloudinary.uploader.upload(req.files['panCard'][0].path);
            const shopLicenseUpload = await cloudinary.uploader.upload(req.files['shopLicense'][0].path);

            // Construct the seller object with Cloudinary URLs
            console.log("aadharCardUpload.secure_url", aadharCardUpload.secure_url);

            const seller = {
                name: req.body.name,
                email: email,
                password: req.body.password,
                avatar: avatarUpload.secure_url,
                aadharCard: aadharCardUpload.secure_url,
                panCard: panCardUpload.secure_url,
                shopLicense: shopLicenseUpload.secure_url,
                address: req.body.address,
                phoneNumber: req.body.phoneNumber,
                zipCode: req.body.zipCode,
                status: "pending",
            };

            const activationToken = createActivationToken(seller);
            console.log("activationToken", activationToken);
            const activationUrl = `http://localhost:3000/seller/activation/${activationToken}`;

            try {
                await sendMail({
                    email: seller.email,
                    subject: "Activate your Shop",
                    message: `Hello ${seller.name}, please click on the link to activate your shop: ${activationUrl}`,
                });
                res.status(201).json({
                    success: true,
                    message: `please check your email:- ${seller.email} to activate your shop!`,
                });
            } catch (error) {
                return next(new ErrorHandler(error.message, 500));
            }
        } catch (error) {
            return next(new ErrorHandler(error.message, 400));
        }
    }
);


// create activation token
const createActivationToken = (seller) => {
    return jwt.sign(seller, process.env.ACTIVATION_SECRET, {
        expiresIn: "5m",
    });
};

// activate user
router.post(
    "/activation",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { activation_token } = req.body;

            const newSeller = jwt.verify(
                activation_token,
                process.env.ACTIVATION_SECRET
            );

            if (!newSeller) {
                return next(new ErrorHandler("Invalid token", 400));
            }
            const { name, email, password, avatar, zipCode, address, phoneNumber, aadharCard, panCard, shopLicense } =
                newSeller;

            let seller = await Shop.findOne({ email });

            if (seller) {
                return next(new ErrorHandler("User already exists", 400));
            }

            seller = await Shop.create({
                name,
                email,
                avatar,
                password,
                zipCode,
                address,
                phoneNumber,
                aadharCard,
                panCard,
                shopLicense,
                status: "approved",
            });

            sendShopToken(seller, 201, res);
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);





// login shop
router.post(
    "/login-shop",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { email, password } = req.body;

            const user = await Shop.findOne({ email }).select("+password");

            if (!user) {
                return next(new ErrorHandler("User doesn't exist!", 400));
            }

            if (user.status !== "approved") {
                return next(new ErrorHandler("Your account is not yet approved.", 401));
            }

            const isPasswordValid = await user.comparePassword(password);

            if (!isPasswordValid) {
                return next(
                    new ErrorHandler("Please provide the correct information.", 400)
                );
            }

            sendShopToken(user, 201, res);

        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// load shop
router.get(
    "/getSeller",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const seller = await Shop.findById(req.seller._id);

            if (!seller) {
                return next(new ErrorHandler("User doesn't exists", 400));
            }

            res.status(200).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// log out from shop
router.get(
    "/logout",
    catchAsyncErrors(async (req, res, next) => {
        try {
            res.cookie("seller_token", null, {
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

// get shop info
router.get(
    "/get-shop-info/:id",
    catchAsyncErrors(async (req, res, next) => {
        try {
            const shop = await Shop.findById(req.params.id);
            res.status(201).json({
                success: true,
                shop,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update shop profile picture
router.put(
    "/update-shop-avatar",
    isSeller,
    upload.single("image"),
    catchAsyncErrors(async (req, res, next) => {
        try {
            const existsUser = await Shop.findById(req.seller._id);

            // Delete the existing avatar on Cloudinary
            if (existsUser.avatar) {
                const publicId = existsUser.avatar.split('/').slice(-1)[0].split('.')[0];
                await cloudinary.uploader.destroy(publicId);
            }

            // Upload the new avatar image to Cloudinary
            const result = await cloudinary.uploader.upload(req.file.path);
            console.log("req.seller._id", result.secure_url);

            // Update the shop's avatar with the Cloudinary URL
            const seller = await Shop.findByIdAndUpdate(req.seller._id, {
                avatar: result.secure_url,
            });

            res.status(200).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// update seller info
router.put(
    "/update-seller-info",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { name, description, address, phoneNumber, zipCode } = req.body;

            const shop = await Shop.findOne(req.seller._id);

            if (!shop) {
                return next(new ErrorHandler("User not found", 400));
            }

            shop.name = name;
            shop.description = description;
            shop.address = address;
            shop.phoneNumber = phoneNumber;
            shop.zipCode = zipCode;

            await shop.save();

            res.status(201).json({
                success: true,
                shop,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// // all sellers --- for admin
// router.get(
//     "/admin-all-sellers",
//     isAuthenticated,
//     isAdmin("Admin"),
//     catchAsyncErrors(async (req, res, next) => {
//         try {
//             const sellers = await Shop.find().sort({
//                 createdAt: -1,
//             });
//             res.status(201).json({
//                 success: true,
//                 sellers,
//             });
//         } catch (error) {
//             return next(new ErrorHandler(error.message, 500));
//         }
//     })
// );

// // delete seller ---admin
// router.delete(
//     "/delete-seller/:id",
//     isAuthenticated,
//     isAdmin("Admin"),
//     catchAsyncErrors(async (req, res, next) => {
//         try {
//             const seller = await Shop.findById(req.params.id);

//             if (!seller) {
//                 return next(
//                     new ErrorHandler("Seller is not available with this id", 400)
//                 );
//             }

//             await Shop.findByIdAndDelete(req.params.id);

//             res.status(201).json({
//                 success: true,
//                 message: "Seller deleted successfully!",
//             });
//         } catch (error) {
//             return next(new ErrorHandler(error.message, 500));
//         }
//     })
// );

// update seller withdraw methods --- sellers
router.put(
    "/update-payment-methods",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const { withdrawMethod } = req.body;

            const seller = await Shop.findByIdAndUpdate(req.seller._id, {
                withdrawMethod,
            });

            res.status(201).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

// delete seller withdraw merthods --- only seller
router.delete(
    "/delete-withdraw-method/",
    isSeller,
    catchAsyncErrors(async (req, res, next) => {
        try {
            const seller = await Shop.findById(req.seller._id);

            if (!seller) {
                return next(new ErrorHandler("Seller not found with this id", 400));
            }

            seller.withdrawMethod = null;

            await seller.save();

            res.status(201).json({
                success: true,
                seller,
            });
        } catch (error) {
            return next(new ErrorHandler(error.message, 500));
        }
    })
);

module.exports = router;
