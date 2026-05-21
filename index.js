const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

const uri = process.env.MONGO_URI;

// 1. Dynamic CORS Policy and Request Interception Layout Engine
const allowedOrigins = [
  "https://a9-cat12-bysaiful.vercel.app",
  "http://localhost:3000" // Kept for seamless local testing layout environments
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-user-id");

  // Instantly return 200 OK for browser preflight OPTIONS checks
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

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
    // Select the studyNook database and target collection
    const db = client.db("study-nook");
    const roomsCollection = db.collection("rooms");
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

        const userId = req.headers["x-user-id"] || req.body.owner;

        if (!userId) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access: An authenticated session identifier is required.",
          });
        }

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
            message: "Missing parameters. Name, description, image, floor, capacity, and hourlyRate are required fields.",
          });
        }

        const newRoomDocument = {
          name: name.trim(),
          description: description,
          image: image,
          floor: floor,
          capacity: Number(capacity),
          hourlyRate: Number(hourlyRate),
          amenities: Array.isArray(amenities) ? amenities : [],
          owner: userId,
          bookingCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

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
          message: "Internal server error occurred while writing database logs.",
        });
      }
    });

    /* ==========================================================
       4.2 Get User Listings (GET /api/my-listings)
       ========================================================== */
    app.get("/api/my-listings", async (req, res) => {
      try {
        const ownerId = req.headers["x-user-id"];

        if (!ownerId) {
          return res.status(401).json({
            success: false,
            message: "Unauthorized access: An authenticated session identifier is required.",
          });
        }

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
          message: "Internal server error occurred while retrieving user listings.",
        });
      }
    });

    /* ==========================================================
       4.3 Get All Rooms (GET /api/rooms) - Public Route
       ========================================================== */
    app.get("/api/rooms", async (req, res) => {
      try {
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
          message: "Internal server error occurred while pulling public rooms catalog.",
        });
      }
    });

    /* ==========================================================
       4.4 Get Latest 6 Rooms (GET /api/home-rooms) - Public Route
       ========================================================== */
    app.get("/api/home-rooms", async (req, res) => {
      try {
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
          message: "Internal server error occurred while pulling latest home rooms.",
        });
      }
    });

    /* ==========================================================
       4.5 GET Single Room Details (GET /api/rooms/:id) - Public
       ========================================================== */
    app.get("/api/rooms/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const cleanId = id ? id.trim() : "";

        if (!ObjectId.isValid(cleanId)) {
          return res.status(400).json({
            success: false,
            message: "The provided structural room ID format is invalid.",
          });
        }

        const room = await roomsCollection.findOne({
          _id: new ObjectId(cleanId),
        });

        if (!room) {
          return res.status(404).json({
            success: false,
            message: "Target workspace space could not be found.",
          });
        }

        return res.status(200).json({
          success: true,
          data: room,
        });
      } catch (error) {
        console.error("[Backend API Fatal Error] Exception inside GET /api/rooms/:id:", error);
        return res.status(500).json({
          success: false,
          message: "Internal server error occurred while retrieving room specifications.",
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
          return res.status(401).json({ success: false, message: "Authentication required." });
        }

        if (!roomId || !startTime || !endTime) {
          return res.status(400).json({
            success: false,
            message: "Missing required booking variables.",
          });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start >= end) {
          return res.status(400).json({
            success: false,
            message: "End time must be after start time.",
          });
        }

        const conflict = await bookingsCollection.findOne({
          roomId: roomId,
          startTime: { $lt: end },
          endTime: { $gt: start },
        });

        if (conflict) {
          return res.status(409).json({
            success: false,
            message: "Time slot conflict! The room is already reserved during this specific window.",
          });
        }

        const newBooking = {
          roomId,
          userId,
          startTime: start,
          endTime: end,
          createdAt: new Date(),
        };
        await bookingsCollection.insertOne(newBooking);

        await roomsCollection.updateOne(
          { _id: new ObjectId(roomId) },
          { $set: { status: "confirmed" }, $inc: { bookingCount: 1 } }
        );

        return res.status(201).json({ success: true, message: "Room slot booked successfully!" });
      } catch (error) {
        console.error("Booking handler error:", error);
        return res.status(500).json({
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
          return res.status(400).json({
            success: false,
            message: "Invalid parameters or unauthorized.",
          });
        }

        const targetRoom = await roomsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!targetRoom) {
          return res.status(404).json({ success: false, message: "Room not found." });
        }

        if (targetRoom.owner !== userId) {
          return res.status(403).json({
            success: false,
            message: "Forbidden: You do not own this listing layout.",
          });
        }

        const cleanPayload = {
          name: updateData.name?.trim() || targetRoom.name,
          description: updateData.description || targetRoom.description,
          image: updateData.image || targetRoom.image,
          floor: updateData.floor || targetRoom.floor,
          capacity: updateData.capacity ? Number(updateData.capacity) : targetRoom.capacity,
          hourlyRate: updateData.hourlyRate ? Number(updateData.hourlyRate) : targetRoom.hourlyRate,
          amenities: Array.isArray(updateData.amenities) ? updateData.amenities : targetRoom.amenities,
          updatedAt: new Date(),
        };

        await roomsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: cleanPayload },
        );
        return res.status(200).json({ success: true, message: "Room updated successfully" });
      } catch (error) {
        console.error("Update endpoint exception:", error);
        return res.status(500).json({ success: false, message: "Server update processing error." });
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
          return res.status(400).json({
            success: false,
            message: "Bad credentials payload requested.",
          });
        }

        const targetRoom = await roomsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!targetRoom) {
          return res.status(404).json({
            success: false,
            message: "Target listing profile does not exist.",
          });
        }

        if (targetRoom.owner !== userId) {
          return res.status(403).json({
            success: false,
            message: "Access Denied: Action restricted to owner assets.",
          });
        }

        await bookingsCollection.deleteMany({ roomId: id });
        await roomsCollection.deleteOne({ _id: new ObjectId(id) });

        return res.status(200).json({ success: true, message: "Room deleted successfully" });
      } catch (error) {
        console.error("Delete endpoint exception:", error);
        return res.status(500).json({
          success: false,
          message: "Server database execution failure.",
        });
      }
    });

    /* ==========================================================
       4.7 Get User Bookings with Status (GET /api/my-bookings)
       ========================================================== */
    app.get('/api/my-bookings', async (req, res) => {
      try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
          return res.status(401).json({ success: false, message: "Unauthorized." });
        }

        const userBookings = await bookingsCollection.aggregate([
          { $match: { userId: userId } },
          {
            $addFields: { roomObjectId: { $toObjectId: "$roomId" } }
          },
          {
            $lookup: {
              from: "rooms",
              localField: "roomObjectId",
              foreignField: "_id",
              as: "roomDetails"
            }
          },
          { $unwind: "$roomDetails" },
          {
            $project: {
              _id: 1,
              roomId: 1,
              startTime: 1,
              endTime: 1,
              createdAt: 1,
              status: { $ifNull: ["$status", "confirmed"] },
              roomInfo: {
                name: "$roomDetails.name",
                image: "$roomDetails.image",
                floor: "$roomDetails.floor",
                hourlyRate: "$roomDetails.hourlyRate"
              }
            }
          },
          { $sort: { startTime: -1 } }
        ]).toArray();

        return res.status(200).json({ success: true, data: userBookings });
      } catch (error) {
        console.error("Aggregation crash error in GET /api/my-bookings:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
      }
    });

    /* ==========================================================
       5.3 Cancel Booking - Private (PATCH /api/bookings/:id/cancel)
       ========================================================== */
    app.patch('/api/bookings/:id/cancel', async (req, res) => {
      try {
        const { id } = req.params;
        const userId = req.headers['x-user-id'];

        if (!userId || !ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid identification parameters." });
        }

        const booking = await bookingsCollection.findOne({ _id: new ObjectId(id) });
        if (!booking) {
          return res.status(404).json({ success: false, message: "Booking record not found." });
        }

        if (booking.userId !== userId) {
          return res.status(403).json({ success: false, message: "Forbidden: You do not own this booking." });
        }

        await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled" } }
        );

        if (db.collection("users")) {
          await db.collection("users").updateOne(
            { _id: new ObjectId(userId) },
            { $pull: { bookings: id } }
          );
        }

        if (booking.roomId && ObjectId.isValid(booking.roomId)) {
          await roomsCollection.updateOne(
            { _id: new ObjectId(booking.roomId) },
            { $inc: { bookingCount: -1 } }
          );
        }

        return res.status(200).json({ success: true, message: "Booking cancelled" });
      } catch (error) {
        console.error("Cancellation routing error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
      }
    });

  } catch (error) {
    console.error("Database connection runtime loop error:", error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("StudyNook Server operational.");
});

// 2. Safe Listener conditional gate protecting serverless allocations
if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`Server listening locally at port ${port}`);
  });
}

// 3. Mandatory export mapping for seamless Vercel integration 
module.exports = app;