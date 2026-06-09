import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getStorageInfo } from "../controller/user.js";

const router = Router()


router.get("/storage" , requireAuth , getStorageInfo)


export default router