const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const uri = process.env.MONGO_URI;

const cors = require("cors");
app.use(cors());
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // Select the studyNook database and target collection
    const db = client.db("study-nook");
    const roomsCollection = db.collection("rooms");
    // Select additional collection instance for bookings management
    const bookingsCollection = db.collection("bookings");

    /* ==========================================================
       4.1 Add Room (POST /api/rooms)
       ========================================================== */
    app.post("/api/rooms", async (req, res) => {
      try {
        const {
          name,
          description,
          image,
          floor,
          capacity,
          hourlyRate,
          amenities,
        } = req.body;

        // 1. Better-Auth Identity Processing Extraction
        // Extracting user tracking details directly from standard headers passed by Better-Auth client.
        // During testing, if you don't have authentication setup yet, you can fallback to a dummy user ID string.
        const userId = req.headers["x-user-id"] || req.body.owner;

        if (!userId) {
          return res.status(401).json({
            success: false,
            message:
              "Unauthorized access: An authenticated session identifier is required.",
          });
        }

        // 2. Clear Payload Check Validation
        if (
          !name ||
          !description ||
          !image ||
          !floor ||
          !capacity ||
          hourlyRate === undefined
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Missing parameters. Name, description, image, floor, capacity, and hourlyRate are required fields.",
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
          updatedAt: new Date(),
        };

        // 4. Perform Database Write Operation
        const result = await roomsCollection.insertOne(newRoomDocument);

        return res.status(201).json({
          success: true,
          message: "Room added successfully",
          roomId: result.insertedId,
        });
      } catch (error) {
        console.error("Error inside POST /api/rooms route:", error);
        return res.status(500).json({
          success: false,
          message:
            "Internal server error occurred while writing database logs.",
        });
      }
    });

    /* ==========================================================
       4.2 Get User Listings (GET /api/my-listings)
       ========================================================== */
    app.get("/api/my-listings", async (req, res) => {
      try {
        // Extract owner ID via request headers passed from the client
        const ownerId = req.headers["x-user-id"];

        if (!ownerId) {
          return res.status(401).json({
            success: false,
            message:
              "Unauthorized access: An authenticated session identifier is required.",
          });
        }

        // Query the database for rooms where 'owner' strictly equals the active ownerId
        const cursor = roomsCollection.find({ owner: ownerId });
        const myListings = await cursor.toArray();

        return res.status(200).json({
          success: true,
          data: myListings,
        });
      } catch (error) {
        console.error("Error inside GET /api/my-listings route:", error);
        return res.status(500).json({
          success: false,
          message:
            "Internal server error occurred while retrieving user listings.",
        });
      }
    });

    /* ==========================================================
       4.3 Get All Rooms (GET /api/rooms) - Public Route
       ========================================================== */
    app.get("/api/rooms", async (req, res) => {
      try {
        // Fetch all listed workspaces without applying user ownership blocks
        const cursor = roomsCollection.find({});
        const allRooms = await cursor.toArray();

        return res.status(200).json({
          success: true,
          data: allRooms,
        });
      } catch (error) {
        console.error("Error inside GET /api/rooms public route:", error);
        return res.status(500).json({
          success: false,
          message:
            "Internal server error occurred while pulling public rooms catalog.",
        });
      }
    });

    /* ==========================================================
       4.4 Get Latest 6 Rooms (GET /api/home-rooms) - Public Route
       ========================================================== */
    app.get("/api/home-rooms", async (req, res) => {
      try {
        // Sort by createdAt descending (-1) and limit to exactly 6 records
        const latestRooms = await roomsCollection
          .find({})
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();

        return res.status(200).json({
          success: true,
          data: latestRooms,
        });
      } catch (error) {
        console.error("Error inside GET /api/home-rooms route:", error);
        return res.status(500).json({
          success: false,
          message:
            "Internal server error occurred while pulling latest home rooms.",
        });
      }
    });



    /* ==========================================================
   4.5 GET Single Room Details (GET /api/rooms/:id) - Public
   ========================================================== */
    app.get("/api/rooms/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // 1. Sanitize the incoming string to clear accidental hidden characters
        const cleanId = id ? id.trim() : "";

        console.log(`[Backend API] Received request for Room ID: "${cleanId}"`);

        // 2. Validate format before passing it to the ObjectId constructor
        if (!ObjectId.isValid(cleanId)) {
          console.warn(
            `[Backend API] Rejected invalid ObjectId format: "${cleanId}"`,
          );
          return res.status(400).json({
            success: false,
            message: "The provided structural room ID format is invalid.",
          });
        }

        // 3. Query using the verified identifier wrapper
        const room = await roomsCollection.findOne({
          _id: new ObjectId(cleanId),
        });

        if (!room) {
          console.log(
            `[Backend API] No room found matching identifier: ${cleanId}`,
          );
          return res.status(404).json({
            success: false,
            message: "Target workspace space could not be found.",
          });
        }

        // Success response
        return res.status(200).json({
          success: true,
          data: room,
        });
      } catch (error) {
        // This logs the exact database processing error to your backend terminal window
        console.error(
          "[Backend API Fatal Error] Exception inside GET /api/rooms/:id:",
          error,
        );

        return res.status(500).json({
          success: false,
          message:
            "Internal server error occurred while retrieving room specifications.",
          errorDetails: error.message,
        });
      }
    });

    /* ==========================================================
       4.6 Secure Booking with Overlap Check (POST /api/bookings)
       ========================================================== */
    app.post("/api/bookings", async (req, res) => {
      try {
        const { roomId, startTime, endTime } = req.body;
        const userId = req.headers["x-user-id"];

        if (!userId) {
          return res
            .status(401)
            .json({ success: false, message: "Authentication required." });
        }

        if (!roomId || !startTime || !endTime) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Missing required booking variables.",
            });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start >= end) {
          return res
            .status(400)
            .json({
              success: false,
              message: "End time must be after start time.",
            });
        }

        // Overlapping Check Logic using $gte and $lte parameters
        // A conflict occurs if an existing booking starts before our request ends AND ends after our request starts
        const conflict = await bookingsCollection.findOne({
          roomId: roomId,
          startTime: { $lt: end },
          endTime: { $gt: start },
        });

        if (conflict) {
          return res.status(409).json({
            success: false,
            message:
              "Time slot conflict! The room is already reserved during this specific window.",
          });
        }

        // Insert new booking log document
        const newBooking = {
          roomId,
          userId,
          startTime: start,
          endTime: end,
          createdAt: new Date(),
        };
        await bookingsCollection.insertOne(newBooking);

        // Atomic update incrementing targeted room's booking counter tracker metric
        await roomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $inc: { bookingCount: 1 } },
        );

        return res
          .status(201)
          .json({ success: true, message: "Room slot booked successfully!" });
      } catch (error) {
        console.error("Booking handler error:", error);
        return res
          .status(500)
          .json({
            success: false,
            message: "Internal server error processing booking.",
          });
      }
    });

    /* ==========================================================
       4.4 Update Room - Owner Only (PUT /api/rooms/:id)
       ========================================================== */
    app.put("/api/rooms/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.headers["x-user-id"];
        const updateData = req.body;

        if (!userId || !ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Invalid parameters or unauthorized.",
            });
        }

        const targetRoom = await roomsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!targetRoom) {
          return res
            .status(404)
            .json({ success: false, message: "Room not found." });
        }

        // Enforce Server Ownership Validation Gate Check
        if (targetRoom.owner !== userId) {
          return res
            .status(403)
            .json({
              success: false,
              message: "Forbidden: You do not own this listing layout.",
            });
        }

        // Build clean atomic updates maps
        const cleanPayload = {
          name: updateData.name?.trim() || targetRoom.name,
          description: updateData.description || targetRoom.description,
          image: updateData.image || targetRoom.image,
          floor: updateData.floor || targetRoom.floor,
          capacity: updateData.capacity
            ? Number(updateData.capacity)
            : targetRoom.capacity,
          hourlyRate: updateData.hourlyRate
            ? Number(updateData.hourlyRate)
            : targetRoom.hourlyRate,
          amenities: Array.isArray(updateData.amenities)
            ? updateData.amenities
            : targetRoom.amenities,
          updatedAt: new Date(),
        };

        await roomsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: cleanPayload },
        );
        return res
          .status(200)
          .json({ success: true, message: "Room updated successfully" });
      } catch (error) {
        console.error("Update endpoint exception:", error);
        return res
          .status(500)
          .json({ success: false, message: "Server update processing error." });
      }
    });

    /* ==========================================================
       4.5 Delete Room - Owner Only (DELETE /api/rooms/:id)
       ========================================================== */
    app.delete("/api/rooms/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.headers["x-user-id"];

        if (!userId || !ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({
              success: false,
              message: "Bad credentials payload requested.",
            });
        }

        const targetRoom = await roomsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!targetRoom) {
          return res
            .status(404)
            .json({
              success: false,
              message: "Target listing profile does not exist.",
            });
        }

        // Server side verification block matching request session key
        if (targetRoom.owner !== userId) {
          return res
            .status(403)
            .json({
              success: false,
              message: "Access Denied: Action restricted to owner assets.",
            });
        }

        // Optional Cascading Task: Remove all tracking references from bookings collection
        await bookingsCollection.deleteMany({ roomId: id });

        // Wipe core document from primary tracking collections indexes
        await roomsCollection.deleteOne({ _id: new ObjectId(id) });

        return res
          .status(200)
          .json({ success: true, message: "Room deleted successfully" });
      } catch (error) {
        console.error("Delete endpoint exception:", error);
        return res
          .status(500)
          .json({
            success: false,
            message: "Server database execution failure.",
          });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening at ${process.env.Localhost}`);
});
