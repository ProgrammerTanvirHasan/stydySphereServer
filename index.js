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

    const bookingCollection = client
      .db("studySphere")
      .collection("bookedSession");

    app.post("/session", async (req, res) => {
      const card = req.body;
      const result = await sessionBd.insertOne(card);
      res.send(result);
    });
    app.post("/bookedSession", async (req, res) => {
      const card = req.body;
      const result = await bookingCollection.insertOne(card);
      res.send(result);
    });
    //todo
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

    app.get("/bookedSession/:email", async (req, res) => {
      const { email } = req.params;
      const query = {
        studentEmail: email,
      };
      const result = await bookingCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/session/:_id", async (req, res) => {
      const { _id } = req.params;
      const query = { _id: new ObjectId(_id) };
      const result = await sessionBd.findOne(query);
      res.send(result);
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
