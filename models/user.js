const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: String,
    email: String,
    dateCrawled: Date
});

module.exports = mongoose.model('User', userSchema);
