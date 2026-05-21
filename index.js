const express = require('express');
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;

const uri = process.env.MONGO_URI;



const cors = require('cors');
app.use(cors());
app.use(express.json());



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Select the studyNook database and target collection
    db = client.db("study-nook");
    roomsCollection = db.collection("rooms");





  
  /* ==========================================================
       4.1 Add Room (POST /api/rooms)
       ========================================================== */
    app.post('/api/rooms', async (req, res) => {
      try {
        const { name, description, image, floor, capacity, hourlyRate, amenities } = req.body;

        // 1. Better-Auth Identity Processing Extraction
        // Extracting user tracking details directly from standard headers passed by Better-Auth client.
        // During testing, if you don't have authentication setup yet, you can fallback to a dummy user ID string.
        const userId = req.headers['x-user-id'] || req.body.owner; 

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access: An authenticated session identifier is required."
          });
        }

        // 2. Clear Payload Check Validation
        if (!name || !description || !image || !floor || !capacity || hourlyRate === undefined) {
          return res.status(400).json({
            success: false,
            message: "Missing parameters. Name, description, image, floor, capacity, and hourlyRate are required fields."
          });
        }

        // 3. Assemble Safe Structural Document Schema
        const newRoomDocument = {
          name: name.trim(),
          description: description,
          image: image,
          floor: floor,
          capacity: Number(capacity),
          hourlyRate: Number(hourlyRate),
          // Ensure amenities compiles down safely into a structured array of strings
          amenities: Array.isArray(amenities) ? amenities : [],
          owner: userId, // Establishes explicit ownership for subsequent edit/delete comparisons
          bookingCount: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // 4. Perform Database Write Operation
        const result = await roomsCollection.insertOne(newRoomDocument);

        return res.status(201).json({
          success: true,
          message: "Room added successfully",
          roomId: result.insertedId
        });

      } catch (error) {
        console.error("Error inside POST /api/rooms route:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error occurred while writing database logs."
        });
      }
    });











    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening at ${process.env.Localhost}`);
});