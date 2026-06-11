import mongoose from "mongoose";

export const isValidMongoId = (id) => {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id);
};

export const isValidOptionalMongoId = (id) => {
  return (
    id === null ||
    id === undefined ||
    id === "" ||
    isValidMongoId(id)
  );
};