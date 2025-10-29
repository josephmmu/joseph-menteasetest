const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Role = require("./models/Role");
const Program = require("./models/Program");

// Load environment variables from .env file
dotenv.config();

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected for seeding...");

    // --- Seed Roles ---
    const existingRoles = await Role.find({});
    if (existingRoles.length === 0) {
      const rolesToCreate = [
        { roleName: "student" },
        { roleName: "mentor" },
        { roleName: "admin" },
        { roleName: "pendingAdmin" },
      ];
      await Role.insertMany(rolesToCreate);
      console.log("Roles have been successfully seeded!");
    } else {
      console.log("Roles already exist. No seeding needed.");
    }

    // --- Seed Programs ---
    const existingPrograms = await Program.find({});
    if (existingPrograms.length === 0) {
      const programsToCreate = [
        { programName: "IT" },
        { programName: "BA" },
        { programName: "GE" },
      ];
      await Program.insertMany(programsToCreate);
      console.log("Programs have been successfully seeded!");
    } else {
      console.log("Programs already exist. No seeding needed.");
    }
  } catch (error) {
    console.error("Error seeding database:", error);
  } finally {
    // Close the connection
    mongoose.connection.close();
    console.log("MongoDB connection closed.");
  }
};

seedDatabase();
