const mongoose = require('mongoose');
const Schema = new mongoose.Schema({}, { strict: false, timestamps: true });
module.exports = mongoose.models.Experience || mongoose.model('Experience', Schema, 'experiences');
