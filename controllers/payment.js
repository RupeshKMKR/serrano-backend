const express = require("express");
// const { instance } = require("../server");
const crypto = require("crypto");
const { Payment } = require("../model/paymentModel");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const Razorpay = require('razorpay');
const router = express.Router();

const instance = new Razorpay({
    key_id: process.env.RAZORPAY_API_KEY,
    key_secret: process.env.RAZORPAY_APT_SECRET,
});
router.post("/checkout", catchAsyncErrors(async (req, res, next) => {
    const options = {
        amount: Number(req.body.amount * 100),
        currency: "INR",
    };
    console.log("options", options);
    const order = await instance.orders.create(options);
    console.log("order", order);
    res.status(200).json({
        success: true,
        order,
    });
}));

router.post("/paymentverification", catchAsyncErrors(async (req, res, next) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_APT_SECRET)
        .update(body.toString())
        .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
        // Database comes here

        await Payment.create({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });
        res.status(200).json({
            success: true,
        });
        // res.redirect(
        //   `http://localhost:3000/paymentsuccess?reference=${razorpay_payment_id}`
        // );
    } else {
        res.status(400).json({
            success: false,
        });
    }
}));


router.get("/getkey", catchAsyncErrors(async (req, res) =>
    res.status(200).json({ key: process.env.RAZORPAY_API_KEY })
));

module.exports = router;

