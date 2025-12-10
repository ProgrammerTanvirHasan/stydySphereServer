const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const stripe = require("stripe")(
  "sk_test_51QUQaHRvXT53lVY8zrZcMryGJWCrHhKWzymYxKmCf5rDfQnHbUBnknXGJin8IrqgFU3s85K8YuksAegSndtiVuOo004qoLzxZG"
);

const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 4001;
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://studysphere-cf030.web.app",
      "https://studysphere-cf030.firebaseapp.com",
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    ].filter(Boolean),
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster2.oe4mukv.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Lazy connection for serverless
let isConnected = false;
let collections = {};

async function connectDB() {
  if (isConnected) {
    return collections;
  }
  try {
    await client.connect();
    isConnected = true;
    collections = {
      sessionBd: client.db("studySphere").collection("session"),
      reviewsCollection: client.db("studySphere").collection("reviews"),
      storeCollection: client.db("studySphere").collection("stored"),
      usersCollection: client.db("studySphere").collection("register"),
      materialCollection: client.db("studySphere").collection("material"),
      bookingCollection: client.db("studySphere").collection("bookedSession"),
    };
    console.log("Connected to MongoDB");
    return collections;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.jwt_token;
  if (!token) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "UnAuthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function getCollections() {
  return await connectDB();
}

const verifyAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.email) {
      return res.status(401).send({ message: "Unauthorized request" });
    }
    const db = await getCollections();
    const user = await db.usersCollection.findOne({ email: req.user.email });
    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "you have no access" });
    }
    next();
  } catch (error) {
    console.error("Error in verifyAdmin:", error);
    return res.status(500).send({ message: "Internal server error" });
  }
};

// auth related api
app.post("/jwt", async (req, res) => {
  const { email } = req.body;

  const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
    expiresIn: "1h",
  });

  res
    .cookie("jwt_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    })
    .send({ success: true });
});

app.post("/logOut", async (req, res) => {
  try {
    // Clear the JWT token from cookies
    res.clearCookie("jwt_token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.status(200).send({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout:", error.message);
    res.status(500).send({ success: false, error: "Logout failed" });
  }
});

// service related api

app.post("/session", async (req, res) => {
  try {
    const db = await getCollections();
    const card = req.body;
    const result = await db.sessionBd.insertOne(card);
    res.send(result);
  } catch (error) {
    console.error("Error in /session POST:", error);
    res.status(500).send({ message: "Failed to create session" });
  }
});

app.post("/material", async (req, res) => {
  try {
    const db = await getCollections();
    const card = req.body;
    const result = await db.materialCollection.insertOne(card);
    res.send(result);
  } catch (error) {
    console.error("Error in /material POST:", error);
    res.status(500).send({ message: "Failed to create material" });
  }
});

app.get("/material", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getCollections();
    const cursor = db.materialCollection.find();
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /material GET:", error);
    res.status(500).send({ message: "Failed to fetch materials" });
  }
});

app.get("/material/material/:studySessionID", async (req, res) => {
  const { studySessionID } = req.params;
  const query = { studySessionId: studySessionID };
  try {
    const db = await getCollections();
    const result = await db.materialCollection.findOne(query);
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: "Material not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "An error occurred on the server" });
  }
});

app.get("/material/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).send({ message: "forbidden excess" });
    }
    const db = await getCollections();
    const email = req.params.email;
    const query = { tutorEmail: email };
    const result = await db.materialCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /material/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch materials" });
  }
});

app.get("/material/update/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.materialCollection.findOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /material/update/:_id GET:", error);
    res.status(500).send({ message: "Failed to fetch material" });
  }
});

app.patch("/material/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const filter = { _id: new ObjectId(_id) };
    const options = { upsert: true };
    const { title, driveLink, imageUrl } = req.body;
    const updateDoc = {
      $set: {
        title: title,
        driveLink: driveLink,
        imageUrl: imageUrl,
      },
    };
    const result = await db.materialCollection.updateOne(
      filter,
      updateDoc,
      options
    );
    res.send(result);
  } catch (error) {
    console.error("Error in /material/:_id PATCH:", error);
    res.status(500).send({ message: "Failed to update material" });
  }
});

app.delete("/material/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.materialCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /material/:_id DELETE:", error);
    res.status(500).send({ message: "Failed to delete material" });
  }
});

app.post("/reviews", async (req, res) => {
  try {
    const db = await getCollections();
    const card = req.body;
    const result = await db.reviewsCollection.insertOne(card);
    res.send(result);
  } catch (error) {
    console.error("Error in /reviews POST:", error);
    res.status(500).send({ message: "Failed to create review" });
  }
});

app.post("/stored", async (req, res) => {
  try {
    const db = await getCollections();
    const card = req.body;
    const result = await db.storeCollection.insertOne(card);
    res.send(result);
  } catch (error) {
    console.error("Error in /stored POST:", error);
    res.status(500).send({ message: "Failed to store data" });
  }
});

app.post("/bookedSession", async (req, res) => {
  try {
    const db = await getCollections();
    const bookingData = req.body;
    const { studentEmail, studySessionID } = bookingData;
    const existingBooking = await db.bookingCollection.findOne({
      studentEmail: studentEmail,
      studySessionID: studySessionID,
    });
    if (existingBooking) {
      return res.status(400).send({
        message: "You have already booked this session.",
      });
    }
    const result = await db.bookingCollection.insertOne(bookingData);
    res.send(result);
  } catch (error) {
    console.error("Error in /bookedSession POST:", error);
    res.status(500).send({ message: "Failed to book session" });
  }
});

app.post("/register", async (req, res) => {
  try {
    const db = await getCollections();
    const card = req.body;
    const result = await db.usersCollection.insertOne(card);
    res.send(result);
  } catch (error) {
    console.error("Error in /register POST:", error);
    res.status(500).send({ message: "Failed to register user" });
  }
});

app.patch("/register/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const filter = { _id: new ObjectId(_id) };
    const { role } = req.body;
    const options = { upsert: true };
    const updateDoc = {
      $set: { role },
    };
    const result = await db.usersCollection.updateOne(
      filter,
      updateDoc,
      options
    );
    res.send(result);
  } catch (error) {
    console.error("Error in /register/:_id PATCH:", error);
    res.status(500).send({ message: "Failed to update user" });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  const { amount } = req.body;

  try {
    if (!amount || typeof amount !== "number") {
      return res.status(400).send({ error: "Invalid amount provided" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({
      client_secret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.get("/session/email/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).send({ message: "forbidden excess" });
    }
    const db = await getCollections();
    const { email } = req.params;
    const query = { email: email };
    const cursor = db.sessionBd.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /session/email/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch sessions" });
  }
});

app.get("/session", async (req, res) => {
  try {
    const db = await getCollections();
    const cursor = db.sessionBd.find();
    const result = await cursor.toArray();

    res.send(result);
  } catch (error) {
    console.error("Error in /session GET:", error);
    res.status(500).send({ message: "Failed to fetch sessions" });
  }
});

app.get(
  "/session/PendingApproved",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const db = await getCollections();
      const query = { status: { $in: ["Pending", "Approved"] } };
      const cursor = db.sessionBd.find(query);
      const result = await cursor.toArray();
      res.send(result);
    } catch (error) {
      console.error("Error in /session/PendingApproved GET:", error);
      res.status(500).send({ message: "Failed to fetch sessions" });
    }
  }
);

app.get("/session/Approved", async (req, res) => {
  try {
    const db = await getCollections();
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 3;
    const skip = page * limit;
    const query = { status: "Approved" };
    const totalCount = await db.sessionBd.countDocuments(query);
    const result = await db.sessionBd
      .find(query)
      .skip(skip)
      .limit(limit)
      .toArray();
    res.send({ sessions: result, totalCount });
  } catch (error) {
    console.error("Error in /session/Approved GET:", error);
    res.status(500).send({ message: "Failed to fetch sessions" });
  }
});

app.get("/session/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).send({ message: "forbidden excess" });
    }
    const db = await getCollections();
    const { email } = req.params;
    const query = { email: email, status: "Approved" };
    const cursor = db.sessionBd.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /session/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch sessions" });
  }
});

app.get("/register", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getCollections();
    const cursor = db.usersCollection.find();
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /register GET:", error);
    res.status(500).send({ message: "Failed to fetch users" });
  }
});

app.get("/register/register", async (req, res) => {
  try {
    const db = await getCollections();
    const query = { role: "tutor" };
    const cursor = db.usersCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /register/register GET:", error);
    res.status(500).send({ message: "Failed to fetch tutors" });
  }
});

app.get("/register/:email", async (req, res) => {
  try {
    const db = await getCollections();
    const { email } = req.params;
    const query = { email: email };
    const result = await db.usersCollection.findOne(query);
    if (!result) {
      return res.send([]);
    }
    res.send(result);
  } catch (error) {
    console.error("Error in /register/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch user" });
  }
});

app.patch("/session/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const filter = { _id: new ObjectId(_id) };
    const { status, amount, reason, feedback } = req.body;
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        status: status || null,
        amount: amount || 0,
        reason: reason || null,
        feedback: feedback || null,
      },
    };
    const result = await db.sessionBd.updateOne(filter, updateDoc, options);
    res.send(result);
  } catch (error) {
    console.error("Error in /session/:_id PATCH:", error);
    res.status(500).send({ message: "Failed to update session" });
  }
});

app.delete("/session/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.sessionBd.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /session/:_id DELETE:", error);
    res.status(500).send({ message: "Failed to delete session" });
  }
});

app.get("/reviews/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { reviewID: _id };
    const cursor = db.reviewsCollection.find(query);
    const result = await cursor.toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /reviews/:_id GET:", error);
    res.status(500).send({ message: "Failed to fetch reviews" });
  }
});

app.get("/bookedSession/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).send({ message: "forbidden excess" });
    }
    const db = await getCollections();
    const { email } = req.params;
    const query = { studentEmail: email };
    const result = await db.bookingCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /bookedSession/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch booked sessions" });
  }
});

app.get("/stored/email/:email", verifyToken, async (req, res) => {
  try {
    const db = await getCollections();
    const { email } = req.params;
    const query = { email: email };
    const result = await db.storeCollection.find(query).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error in /stored/email/:email GET:", error);
    res.status(500).send({ message: "Failed to fetch stored data" });
  }
});

app.get("/stored/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.storeCollection.findOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /stored/:_id GET:", error);
    res.status(500).send({ message: "Failed to fetch stored data" });
  }
});

app.delete("/stored/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.storeCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /stored/:_id DELETE:", error);
    res.status(500).send({ message: "Failed to delete stored data" });
  }
});

app.patch("/stored/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const card = req.body;
    const filter = { _id: new ObjectId(_id) };
    const options = { upsert: true };
    const updateDoc = {
      $set: {
        title: card.title,
        note: card.note,
      },
    };
    const result = await db.storeCollection.updateOne(
      filter,
      updateDoc,
      options
    );
    res.send(result);
  } catch (error) {
    console.error("Error in /stored/:_id PATCH:", error);
    res.status(500).send({ message: "Failed to update stored data" });
  }
});

app.get("/session/Approved/:_id", async (req, res) => {
  try {
    const db = await getCollections();
    const { _id } = req.params;
    const query = { _id: new ObjectId(_id) };
    const result = await db.sessionBd.findOne(query);
    res.send(result);
  } catch (error) {
    console.error("Error in /session/Approved/:_id GET:", error);
    res.status(500).send({ message: "Failed to fetch session" });
  }
});

app.get("/bookedSession/title/:title", async (req, res) => {
  try {
    const db = await getCollections();
    const { title } = req.params;
    const query = { title: title };
    const result = await db.bookingCollection.findOne(query);
    const emailQuery = { title: title };
    const emailResults = await db.bookingCollection.find(emailQuery).toArray();
    const emails = emailResults.map((session) => session.studentEmail);
    const responseData = {
      data: result,
      emails: emails,
    };
    res.send(responseData);
  } catch (error) {
    console.error("Error in /bookedSession/title/:title GET:", error);
    res.status(500).send({ message: "Failed to fetch booking data" });
  }
});

app.get("/", (req, res) => {
  res.send("Hello World!!");
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}
