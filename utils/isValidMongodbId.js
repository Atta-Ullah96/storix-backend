import mongoose from "mongoose";

export const isValidMongoId = (id) => {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
};