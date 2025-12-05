const mongoose = require('mongoose');
const Schema = new mongoose.Schema({}, { strict: false, timestamps: true });
module.exports = mongoose.models.Institute || mongoose.model('Institute', Schema);
