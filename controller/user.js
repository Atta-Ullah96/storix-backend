import Auth from "../models/auth.js";

const DEFAULT_STORAGE_LIMIT = 8 * 1024 * 1024 * 1024; // 8GB

export const getStorageInfo = async (req, res, next) => {
  try {
    const user = await Auth.findById(req.user._id).select(
      "storageUsed storageLimit"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const used = Number(user.storageUsed || 0);
    const limit = Number(user.storageLimit || DEFAULT_STORAGE_LIMIT);
    const remaining = Math.max(limit - used, 0);

    const percentage =
      limit > 0 ? Math.min(Number(((used / limit) * 100).toFixed(2)), 100) : 0;

    return res.status(200).json({
      success: true,
      storage: {
        used,
        limit,
        remaining,
        percentage,
      },
    });
  } catch (error) {
    next(error);
  }
};