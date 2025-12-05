const mongoose = require('mongoose');
const Schema = new mongoose.Schema({}, { strict: false, timestamps: true });
Schema.methods.incrementDownload = async function() { this.downloadCount = (this.downloadCount || 0) + 1; };
const Model = mongoose.models.Resume || mongoose.model('Resume', Schema, 'resumes');

module.exports = Model;
