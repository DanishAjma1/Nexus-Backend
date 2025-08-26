import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: Boolean,
});

const User = mongoose.model("User", UserSchema);
export default User;
