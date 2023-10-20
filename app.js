const express = require("express");
const ErrorHandler = require("./middleware/error");
const app = express();
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

// Allow requests from specific origins
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "https://admin.serrano.in");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Credentials", "true"); // Set the header to true
  next();
});
// app.use(cors({
//   origin: ['https://admin.serrano.in/',],
//   credentials: true
// }));


app.use(express.json());
app.use(cookieParser());
app.use("/api/test", (req, res) => {
  res.send("Hello world!");
});
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb", parameterLimit: 50000 }));

// config
if (process.env.NODE_ENV !== "PRODUCTION") {
  require("dotenv").config({
    path: ".env",
  });
}

// import routes
const user = require("./controllers/user");
const shop = require("./controllers/shop");
const admin = require("./controllers/admin");
const product = require("./controllers/product");
const payment = require("./controllers/payment");
const order = require("./controllers/order");

app.use("/api/products", (req, res) => {
  return res.status(200).json({
    message: 'This is new feature change, a new route for products'
  })
});
app.use("/api/v2/user", user);
app.use("/api/v2/order", order);
app.use("/api/v2/shop", shop);
app.use("/api/v2/admin", admin);
app.use("/api/v2/payment", payment);
app.use("/api/v2/product", product);

// it's for ErrorHandling
app.use(ErrorHandler);

module.exports = app;
