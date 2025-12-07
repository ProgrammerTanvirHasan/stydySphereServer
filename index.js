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
      "https://stydysphereserver.onrender.com",
    ],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// Validate environment variables
if (!process.env.DB_USER || !process.env.DB_PASS) {
  console.error(
    "❌ ERROR: DB_USER and DB_PASS environment variables are required!"
  );
  console.error(
    "Please check your .env file and ensure both variables are set."
  );
}

// Properly encode password to handle special characters
const encodedUser = encodeURIComponent(process.env.DB_USER || "");
const encodedPass = encodeURIComponent(process.env.DB_PASS || "");

const uri = `mongodb+srv://${encodedUser}:${encodedPass}@cluster0.4h5vy.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
});

// Helper function to validate ObjectId
const isValidObjectId = (id) => {
  try {
    return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
  } catch {
    return false;
  }
};

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

async function run() {
  // Validate environment variables before attempting connection
  if (!process.env.DB_USER || !process.env.DB_PASS) {
    console.error("❌ MongoDB connection skipped: Missing DB_USER or DB_PASS");
    console.error("Please set these variables in your .env file");
    return;
  }

  let retries = 3;
  let connected = false;

  while (retries > 0 && !connected) {
    try {
      console.log(`Attempting MongoDB connection... (${4 - retries}/3)`);
      await client.connect();
      console.log("✅ Connected to MongoDB successfully");
      connected = true;

      const sessionBd = client.db("studySphere").collection("session");
      const reviewsCollection = client.db("studySphere").collection("reviews");
      const storeCollection = client.db("studySphere").collection("stored");
      const usersCollection = client.db("studySphere").collection("register");
      const materialCollection = client
        .db("studySphere")
        .collection("material");

      const bookingCollection = client
        .db("studySphere")
        .collection("bookedSession");

      const verifyAdmin = async (req, res, next) => {
        try {
          if (!req.user || !req.user.email) {
            return res.status(401).send({ message: "Unauthorized request" });
          }

          const user = await usersCollection.findOne({ email: req.user.email });

          if (!user || user.role !== "admin") {
            return res.status(403).send({ message: "you have no access" });
          }

          next();
        } catch (error) {
          console.error("Error in verifyAdmin:", error.message);
          return res.status(500).send({ message: "Internal server error" });
        }
      };

      // auth related api
      app.post("/jwt", async (req, res) => {
        try {
          const { email } = req.body;

          if (!email) {
            return res.status(400).send({ message: "Email is required" });
          }

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
        } catch (error) {
          console.error("Error in /jwt:", error.message);
          res.status(500).send({ message: "Internal server error" });
        }
      });

      app.post("/logOut", async (req, res) => {
        try {
          // Clear the JWT token from cookies
          res.clearCookie("jwt_token", {
            httpOnly: true,
            secure: true,
            sameSite: "none",
          });
          res
            .status(200)
            .send({ success: true, message: "Logged out successfully" });
        } catch (error) {
          console.error("Error during logout:", error.message);
          res.status(500).send({ success: false, error: "Logout failed" });
        }
      });

      // service related api

      app.post("/session", async (req, res) => {
        try {
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const result = await sessionBd.insertOne(card);
          res.send(result);
        } catch (error) {
          console.error("Error in /session POST:", error.message);
          res.status(500).send({ message: "Failed to create session" });
        }
      });
      app.post("/material", async (req, res) => {
        try {
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const result = await materialCollection.insertOne(card);
          res.send(result);
        } catch (error) {
          console.error("Error in /material POST:", error.message);
          res.status(500).send({ message: "Failed to create material" });
        }
      });

      app.get("/material", verifyToken, verifyAdmin, async (req, res) => {
        try {
          const cursor = materialCollection.find();
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /material GET:", error.message);
          res.status(500).send({ message: "Failed to fetch materials" });
        }
      });

      app.get("/material/material/:studySessionID", async (req, res) => {
        const { studySessionID } = req.params;
        const query = { studySessionId: studySessionID };
        try {
          const result = await materialCollection.findOne(query);
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
          const email = req.params.email;
          const query = {
            tutorEmail: email,
          };

          const result = await materialCollection.find(query).toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /material/:email GET:", error.message);
          res.status(500).send({ message: "Failed to fetch materials" });
        }
      });
      app.get("/material/update/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };

          const result = await materialCollection.findOne(query);
          if (!result) {
            return res.status(404).send({ message: "Material not found" });
          }
          res.send(result);
        } catch (error) {
          console.error("Error in /material/update/:_id GET:", error.message);
          res.status(500).send({ message: "Failed to fetch material" });
        }
      });

      app.patch("/material/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }

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

          const result = await materialCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } catch (error) {
          console.error("Error in /material/:_id PATCH:", error.message);
          res.status(500).send({ message: "Failed to update material" });
        }
      });

      app.delete("/material/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };
          const result = await materialCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /material/:_id DELETE:", error.message);
          res.status(500).send({ message: "Failed to delete material" });
        }
      });

      app.post("/reviews", async (req, res) => {
        try {
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const result = await reviewsCollection.insertOne(card);
          res.send(result);
        } catch (error) {
          console.error("Error in /reviews POST:", error.message);
          res.status(500).send({ message: "Failed to create review" });
        }
      });

      app.post("/stored", async (req, res) => {
        try {
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const result = await storeCollection.insertOne(card);
          res.send(result);
        } catch (error) {
          console.error("Error in /stored POST:", error.message);
          res.status(500).send({ message: "Failed to store data" });
        }
      });

      app.post("/bookedSession", async (req, res) => {
        try {
          const bookingData = req.body;
          if (!bookingData) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const { studentEmail, studySessionID } = bookingData;
          const existingBooking = await bookingCollection.findOne({
            studentEmail: studentEmail,
            studySessionID: studySessionID,
          });
          if (existingBooking) {
            return res.status(400).send({
              message: "You have already booked this session.",
            });
          }
          const result = await bookingCollection.insertOne(bookingData);
          res.send(result);
        } catch (error) {
          console.error("Error in /bookedSession POST:", error.message);
          res.status(500).send({ message: "Failed to book session" });
        }
      });

      app.post("/register", async (req, res) => {
        try {
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const result = await usersCollection.insertOne(card);
          res.send(result);
        } catch (error) {
          console.error("Error in /register POST:", error.message);
          res.status(500).send({ message: "Failed to register user" });
        }
      });

      app.patch("/register/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const filter = { _id: new ObjectId(_id) };
          const { role } = req.body;
          const options = { upsert: true };
          const updateDoc = {
            $set: { role },
          };
          const result = await usersCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } catch (error) {
          console.error("Error in /register/:_id PATCH:", error.message);
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

      app.get(
        "/session/email/:email",
        verifyToken,

        async (req, res) => {
          try {
            if (req.params.email !== req.user.email) {
              return res.status(403).send({ message: "forbidden excess" });
            }
            const { email } = req.params;
            const query = { email: email };
            const cursor = sessionBd.find(query);
            const result = await cursor.toArray();
            res.send(result);
          } catch (error) {
            console.error("Error in /session/email/:email GET:", error.message);
            res.status(500).send({ message: "Failed to fetch sessions" });
          }
        }
      );
      app.get("/session", async (req, res) => {
        try {
          const cursor = sessionBd.find();
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /session GET:", error.message);
          res.status(500).send({ message: "Failed to fetch sessions" });
        }
      });

      app.get(
        "/session/PendingApproved",
        verifyToken,
        verifyAdmin,
        async (req, res) => {
          try {
            const query = { status: { $in: ["Pending", "Approved"] } };
            const cursor = sessionBd.find(query);
            const result = await cursor.toArray();
            res.send(result);
          } catch (error) {
            console.error(
              "Error in /session/PendingApproved GET:",
              error.message
            );
            res.status(500).send({ message: "Failed to fetch sessions" });
          }
        }
      );

      app.get("/session/Approved", async (req, res) => {
        try {
          const page = parseInt(req.query.page) || 0;
          const limit = parseInt(req.query.limit) || 3;
          const skip = page * limit;
          const query = { status: "Approved" };
          const totalCount = await sessionBd.countDocuments(query);
          const result = await sessionBd
            .find(query)
            .skip(skip)
            .limit(limit)
            .toArray();
          res.send({ sessions: result, totalCount });
        } catch (error) {
          console.error("Error in /session/Approved GET:", error.message);
          res.status(500).send({ message: "Failed to fetch sessions" });
        }
      });

      app.get("/session/:email", verifyToken, async (req, res) => {
        try {
          if (req.params.email !== req.user.email) {
            return res.status(403).send({ message: "forbidden excess" });
          }
          const { email } = req.params;
          const query = { email: email, status: "Approved" };
          const cursor = sessionBd.find(query);
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /session/:email GET:", error.message);
          res.status(500).send({ message: "Failed to fetch sessions" });
        }
      });

      app.get("/register", verifyToken, verifyAdmin, async (req, res) => {
        try {
          const cursor = usersCollection.find();
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /register GET:", error.message);
          res.status(500).send({ message: "Failed to fetch users" });
        }
      });

      app.get("/register/register", async (req, res) => {
        try {
          const query = { role: "tutor" };
          const cursor = usersCollection.find(query);
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /register/register GET:", error.message);
          res.status(500).send({ message: "Failed to fetch tutors" });
        }
      });

      app.get("/register/:email", async (req, res) => {
        try {
          const { email } = req.params;
          const query = { email: email };
          const result = await usersCollection.findOne(query);
          if (!result) {
            return res.send([]);
          }
          res.send(result);
        } catch (error) {
          console.error("Error in /register/:email GET:", error.message);
          res.status(500).send({ message: "Failed to fetch user" });
        }
      });

      app.patch("/session/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }

          console.log("Request Body:", req.body);

          const filter = { _id: new ObjectId(_id) };
          const { status, amount, reason, feedback } = req.body;
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              status: status ?? null,
              amount: amount ?? 0,
              reason: reason ?? null,
              feedback: feedback ?? null,
            },
          };
          const result = await sessionBd.updateOne(filter, updateDoc, options);
          res.send(result);
        } catch (error) {
          console.error("Error in /session/:_id PATCH:", error.message);
          res.status(500).send({ message: "Failed to update session" });
        }
      });

      app.delete("/session/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };
          const result = await sessionBd.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /session/:_id DELETE:", error.message);
          res.status(500).send({ message: "Failed to delete session" });
        }
      });

      app.get("/reviews/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          const query = {
            reviewID: _id,
          };
          const cursor = reviewsCollection.find(query);
          const result = await cursor.toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /reviews/:_id GET:", error.message);
          res.status(500).send({ message: "Failed to fetch reviews" });
        }
      });

      app.get(
        "/bookedSession/:email",
        verifyToken,

        async (req, res) => {
          try {
            if (req.params.email !== req.user.email) {
              return res.status(403).send({ message: "forbidden excess" });
            }

            const { email } = req.params;
            const query = {
              studentEmail: email,
            };
            const result = await bookingCollection.find(query).toArray();
            res.send(result);
          } catch (error) {
            console.error("Error in /bookedSession/:email GET:", error.message);
            res
              .status(500)
              .send({ message: "Failed to fetch booked sessions" });
          }
        }
      );

      app.get("/stored/email/:email", verifyToken, async (req, res) => {
        try {
          const { email } = req.params;
          const query = { email: email };
          const result = await storeCollection.find(query).toArray();
          res.send(result);
        } catch (error) {
          console.error("Error in /stored/email/:email GET:", error.message);
          res.status(500).send({ message: "Failed to fetch stored data" });
        }
      });

      app.get("/stored/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };
          const result = await storeCollection.findOne(query);
          if (!result) {
            return res.status(404).send({ message: "Stored data not found" });
          }
          res.send(result);
        } catch (error) {
          console.error("Error in /stored/:_id GET:", error.message);
          res.status(500).send({ message: "Failed to fetch stored data" });
        }
      });

      app.delete("/stored/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };
          const result = await storeCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          console.error("Error in /stored/:_id DELETE:", error.message);
          res.status(500).send({ message: "Failed to delete stored data" });
        }
      });

      app.patch("/stored/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const card = req.body;
          if (!card) {
            return res.status(400).send({ message: "Invalid request body" });
          }
          const filter = { _id: new ObjectId(_id) };
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              title: card.title,
              note: card.note,
            },
          };
          const result = await storeCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send(result);
        } catch (error) {
          console.error("Error in /stored/:_id PATCH:", error.message);
          res.status(500).send({ message: "Failed to update stored data" });
        }
      });

      app.get("/session/Approved/:_id", async (req, res) => {
        try {
          const { _id } = req.params;
          if (!isValidObjectId(_id)) {
            return res.status(400).send({ message: "Invalid ID format" });
          }
          const query = { _id: new ObjectId(_id) };

          const result = await sessionBd.findOne(query);
          if (!result) {
            return res.status(404).send({ message: "Session not found" });
          }
          res.send(result);
        } catch (error) {
          console.error("Error in /session/Approved/:_id GET:", error.message);
          res.status(500).send({ message: "Failed to fetch session" });
        }
      });

      app.get("/bookedSession/title/:title", async (req, res) => {
        try {
          const { title } = req.params;

          const query = { title: title };
          const result = await bookingCollection.findOne(query);

          const emailQuery = { title: title };
          const emailResults = await bookingCollection
            .find(emailQuery)
            .toArray();
          const emails = emailResults.map((session) => session.studentEmail);
          const responseData = {
            data: result,
            emails: emails,
          };
          res.send(responseData);
        } catch (error) {
          console.error(
            "Error in /bookedSession/title/:title GET:",
            error.message
          );
          res.status(500).send({ message: "Failed to fetch booking data" });
        }
      });

      await client.db("admin").command({ ping: 1 });
      console.log(
        "Pinged your deployments. You successfully connected to MongoDB!"
      );
      break;
    } catch (error) {
      retries--;
      const attemptNum = 4 - retries;
      console.error(`\n❌ MongoDB connection error (Attempt ${attemptNum}/3):`);
      console.error(`   Error: ${error.message}`);

      // Provide specific troubleshooting based on error type
      if (
        error.message.includes("authentication") ||
        error.message.includes("credentials")
      ) {
        console.error("\n🔐 Authentication Error - Check:");
        console.error("   1. DB_USER and DB_PASS in .env file are correct");
        console.error(
          "   2. Password doesn't contain unencoded special characters"
        );
        console.error("   3. User exists in MongoDB Atlas");
      } else if (
        error.message.includes("SSL") ||
        error.message.includes("TLS") ||
        error.message.includes("tlsv1")
      ) {
        console.error("\n🔒 SSL/TLS Error - Check:");
        console.error("   1. MongoDB Atlas Network Access (IP Whitelist)");
        console.error(
          "      → Add 0.0.0.0/0 to allow all IPs (or your specific IP)"
        );
        console.error("   2. Node.js version (recommend LTS 18.x or 20.x)");
        console.error("   3. Network/firewall settings");
      } else if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("DNS")
      ) {
        console.error("\n🌐 Network/DNS Error - Check:");
        console.error("   1. Internet connection");
        console.error("   2. MongoDB Atlas cluster is running");
        console.error("   3. Cluster hostname is correct");
      } else if (error.message.includes("timeout")) {
        console.error("\n⏱️  Timeout Error - Check:");
        console.error("   1. Network connection stability");
        console.error("   2. MongoDB Atlas cluster status");
        console.error("   3. Firewall blocking connections");
      }

      if (retries > 0) {
        console.log(
          `\n🔄 Retrying in 3 seconds... (${retries} attempts remaining)\n`
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.error("\n❌ Failed to connect to MongoDB after 3 attempts");
        console.error(
          "⚠️  Server will continue but database operations will fail"
        );
        console.error("\n💡 Troubleshooting steps:");
        console.error("   1. Verify .env file has DB_USER and DB_PASS");
        console.error(
          "   2. Check MongoDB Atlas → Network Access → IP Whitelist"
        );
        console.error(
          "   3. Verify MongoDB Atlas → Database Access → User exists"
        );
        console.error("   4. Test connection string in MongoDB Compass");
      }
    }
  }

  if (!connected) {
    console.warn(
      "\n⚠️  WARNING: MongoDB connection failed. API routes may not work properly.\n"
    );
  }
}
run().catch((error) => {
  console.error("Failed to start server:", error.message);
  console.error("Full error:", error);
  process.exit(1);
});

app.get("/", (req, res) => {
  res.send("Hello World!!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
