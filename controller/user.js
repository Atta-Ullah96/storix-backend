import Auth from "../models/auth.js";

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

    const used = user.storageUsed || 0;
    const limit = user.storageLimit || 8 * 1024 * 1024 * 1024;
    const remaining = Math.max(limit - used, 0);

    return res.status(200).json({
      success: true,
      storage: {
        used,
        limit,
        remaining,
        percentage: Math.min(Math.round((used / limit) * 100), 100),
      },
    });
  } catch (error) {
    next(error);
  }
};