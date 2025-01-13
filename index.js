const express = require("express");
const app = express();
const stripe = require("stripe")(
  "sk_test_51QUQaHRvXT53lVY8zrZcMryGJWCrHhKWzymYxKmCf5rDfQnHbUBnknXGJin8IrqgFU3s85K8YuksAegSndtiVuOo004qoLzxZG"
);

const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 4000;
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wfkgk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const sessionBd = client.db("studySphere").collection("session");
    const reviewsCollection = client.db("studySphere").collection("reviews");
    const storeCollection = client.db("studySphere").collection("stored");
    const usersCollection = client.db("studySphere").collection("register");
    const materialCollection = client.db("studySphere").collection("material");

    const announcementCollection = client
      .db("studySphere")
      .collection("announcement");

    const bookingCollection = client
      .db("studySphere")
      .collection("bookedSession");

    app.post("/session", async (req, res) => {
      const card = req.body;
      const result = await sessionBd.insertOne(card);
      res.send(result);
    });
    app.post("/material", async (req, res) => {
      const card = req.body;
      const result = await materialCollection.insertOne(card);
      res.send(result);
    });

    app.get("/material", async (req, res) => {
      const cursor = materialCollection.find();
      const result = await cursor.toArray();
      res.send(result);
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

    app.get("/material/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        tutorEmail: email,
      };

      const result = await materialCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/material/update/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };

      const result = await materialCollection.findOne(query);
      res.send(result);
    });

    app.patch("/material/:_id", async (req, res) => {
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
      const result = await materialCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.delete("/material/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };
      const result = await materialCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/announcement", async (req, res) => {
      const card = req.body;
      const result = await announcementCollection.insertOne(card);
      res.send(result);
    });

    app.get("/announcement", async (req, res) => {
      const cursor = announcementCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/reviews", async (req, res) => {
      const card = req.body;
      const result = await reviewsCollection.insertOne(card);
      res.send(result);
    });

    app.post("/stored", async (req, res) => {
      const card = req.body;
      const result = await storeCollection.insertOne(card);
      res.send(result);
    });

    app.post("/bookedSession", async (req, res) => {
      const bookingData = req.body;
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
    });

    app.post("/register", async (req, res) => {
      const card = req.body;
      const result = await usersCollection.insertOne(card);
      res.send(result);
    });

    app.patch("/register/:_id", async (req, res) => {
      const { _id } = req.params;
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

    app.get("/session", async (req, res) => {
      const cursor = sessionBd.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/session/PendingApproved", async (req, res) => {
      const query = { status: { $in: ["Pending", "Approved"] } };
      const cursor = sessionBd.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/session/Approved", async (req, res) => {
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
    });

    app.get("/session/:email", async (req, res) => {
      const { email } = req.params;

      const query = { email: email, status: "Approved" };
      const cursor = sessionBd.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/register", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/register/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      if (!result) {
        return res.send([]);
      }
      res.send(result);
    });

    app.patch("/session/:_id", async (req, res) => {
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
      const result = await sessionBd.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    app.delete("/session/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };
      const result = await sessionBd.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = {
        reviewID: _id,
      };
      const cursor = reviewsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/bookedSession/:email", async (req, res) => {
      const { email } = req.params;
      const query = {
        studentEmail: email,
      };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/stored/email/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const result = await storeCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/stored/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };
      const result = await storeCollection.findOne(query);
      res.send(result);
    });

    app.delete("/stored/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };
      const result = await storeCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/stored/:_id", async (req, res) => {
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
      const result = await storeCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.get("/session/Approved/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };

      const result = await sessionBd.findOne(query);
      res.send(result);
    });

    app.get("/bookedSession/title/:title", async (req, res) => {
      const { title } = req.params;

      const query = { title: title };
      const result = await bookingCollection.findOne(query);

      const emailQuery = { title: title };
      const emailResults = await bookingCollection.find(emailQuery).toArray();
      const emails = emailResults.map((session) => session.studentEmail);
      const responseData = {
        data: result,
        emails: emails,
      };
      res.send(responseData);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployments. You successfully connected to MongoDB!"
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
