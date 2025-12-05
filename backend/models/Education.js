const mongoose = require('mongoose');
const Schema = new mongoose.Schema({}, { strict: false, timestamps: true });
module.exports = mongoose.models.Education || mongoose.model('Education', Schema, 'educations');
