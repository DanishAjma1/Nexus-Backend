import mongoose from "mongoose";

const UserSchema = mongoose.Schema({
  name: String,
  email: String,
  password: { type: String, select: false },
  role: String,
  avatarUrl: String,
  location: String,
  bio: String,
  isOnline: Boolean,
});

UserSchema.methods.safeDataForAuth = function () {
  return {
    userId: this._id,
    email: this.email,
    role:this.role,
    name:this.name
  };
};

UserSchema.methods.afterLoggedSafeData = function () {
    const userObj = this.toObject();
    userObj.userId = this._id;
    delete userObj.password;
    delete userObj.__v;
    delete userObj._id;
    return userObj;
};

UserSchema.methods.afterLoggedSafeDataForOauth = function () {
    const userObj = this.toObject();
    userObj.userId = this._id;
    delete userObj.__v;
    delete userObj._id;
    return userObj;
};
const User = mongoose.model("User", UserSchema);
export default User;
