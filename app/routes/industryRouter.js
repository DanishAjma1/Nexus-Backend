import { Router } from "express";
import Industry from "../models/industry.js";
import { connectDB } from "../config/mongoDBConnection.js";

const industryRouter = Router();

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

// Initialize predefined industries (run once)
industryRouter.post("/initialize", async (req, res) => {
    try {
        await connectDB();

        for (const industryName of PREDEFINED_INDUSTRIES) {
            // Case-insensitive duplicate check to avoid creating dups
            const exists = await Industry.findOne({
                name: { $regex: `^${industryName}$`, $options: "i" },
            });
            if (!exists) {
                await Industry.create({
                    name: industryName,
                    isCustom: false,
                    recommended: true,
                });
            }
        }

        res.status(200).json({ message: "Industries initialized successfully" });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});

// Get all industries
industryRouter.get("/get-all", async (req, res) => {
    try {
        await connectDB();
        const industries = await Industry.find({}).sort({ recommended: -1, isCustom: 1, name: 1 });
        res.status(200).json(industries);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});

// Get recommended industries
industryRouter.get("/get-recommended", async (req, res) => {
    try {
        await connectDB();
        const industries = await Industry.find({ recommended: true }).sort({ name: 1 });
        res.status(200).json(industries);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});

// Get all industries grouped (recommended + others)
industryRouter.get("/get-grouped", async (req, res) => {
    try {
        await connectDB();
        const recommended = await Industry.find({ recommended: true }).sort({ name: 1 });
        const others = await Industry.find({ recommended: false }).sort({ isCustom: 1, name: 1 });
        res.status(200).json({ recommended, others });
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});

// Add custom industry
industryRouter.post("/add-custom", async (req, res) => {
    try {
        await connectDB();
        const { name, userId } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ message: "Industry name is required" });
        }

        // Check if industry already exists (case-insensitive)
        const exists = await Industry.findOne({
            name: { $regex: `^${name.trim()}$`, $options: "i" },
        });

        if (exists) {
            return res.status(400).json({ message: "Industry already exists" });
        }

        const newIndustry = await Industry.create({
            name: name.trim(),
            isCustom: true,
            createdBy: userId,
        });

        res.status(201).json(newIndustry);
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message });
    }
});

export default industryRouter;
