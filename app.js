const express = require("express");
const ErrorHandler = require("./middleware/error");
const app = express();
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));



app.use(express.json());
app.use(cookieParser());
app.use("/test", (req, res) => {
    res.send("Hello world!");
});

app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// config
if (process.env.NODE_ENV !== "PRODUCTION") {
    require("dotenv").config({
        path: "config/.env",
    });
}

// import routes
const user = require("./controllers/user");
const shop = require("./controllers/shop");
const product = require("./controllers/product");
const order = require("./controllers/order");


app.use("/api/v2/user", user);
app.use("/api/v2/order", order);
app.use("/api/v2/shop", shop);
app.use("/api/v2/product", product);

// it's for ErrorHandling
app.use(ErrorHandler);

module.exports = app;
