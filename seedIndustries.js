import "./loadEnv.js";
import mongoose from "mongoose";
import Industry from "./app/models/industry.js";

const PREDEFINED_INDUSTRIES = [
    "FinTech",
    "HealthTech",
    "EdTech",
    "AgriTech",
    "Food & Beverage",
    "E-Commerce",
    "SaaS (Software as a Service)",
    "Artificial Intelligence & Machine Learning",
    "Blockchain & Web3",
    "Cybersecurity",
    "CleanTech / Renewable Energy",
    "Real Estate & PropTech",
    "Logistics & Supply Chain",
    "Transportation & Mobility",
    "Gaming & Esports",
    "Media & Entertainment",
    "Digital Marketing & AdTech",
    "Travel & Hospitality",
    "Retail & FMCG",
    "Manufacturing & Industry 4.0",
    "IoT (Internet of Things)",
    "Biotechnology",
    "Pharmaceuticals",
    "Telecommunications",
    "Social Impact / NGOs",
    "HRTech",
    "LegalTech",
    "InsurTech",
    "Fashion & Apparel",
    "Sports & Fitness",
    "Construction & Infrastructure",
    "Mining & Metals",
    "Oil & Gas / Energy",
    "Aerospace & Defense",
    "Robotics & Automation",
    "AR / VR / Metaverse",
    "Education Services & Training",
    "Smart Cities",
    "MarTech",
];

const seedIndustries = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.DB_URL);
        console.log("✅ Connected to MongoDB");

        let addedCount = 0;
        let skippedCount = 0;

        for (const industryName of PREDEFINED_INDUSTRIES) {
            // Check if industry already exists (case-insensitive)
            const exists = await Industry.findOne({
                name: { $regex: `^${industryName}$`, $options: "i" },
            });

            if (exists) {
                console.log(`⏭️  Skipped: "${industryName}" (already exists)`);
                skippedCount++;
            } else {
                await Industry.create({
                    name: industryName,
                    isCustom: false,
                    recommended: true,
                });
                console.log(`✅ Added: "${industryName}"`);
                addedCount++;
            }
        }

        console.log("\n========================================");
        console.log(`✅ Successfully added: ${addedCount} industries`);
        console.log(`⏭️  Skipped (already exist): ${skippedCount} industries`);
        console.log(`📊 Total industries in database: ${addedCount + skippedCount}`);
        console.log("========================================\n");

        // Close connection
        await mongoose.connection.close();
        console.log("✅ Database connection closed");
        process.exit(0);
    } catch (error) {
        console.error("❌ Error seeding industries:", error);
        process.exit(1);
    }
};

// Run the seeding function
seedIndustries();
