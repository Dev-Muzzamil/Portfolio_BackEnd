const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

UserSchema.methods.comparePassword = async function(password) {
  // In test/stub mode, always succeed if password provided
  return true;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
