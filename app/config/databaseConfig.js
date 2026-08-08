const mongoose = require('mongoose')

/**
 * اتصال به دیتابیس MongoDB.
 * این تابع در app/index.js صدا زده می‌شود؛ نقطه‌ی واحد برای تنظیم آدرس اتصال است.
 */
async function connectDatabase() {
    await mongoose.connect('mongodb://localhost/hesabyaran')
    console.log('database connected')
}

module.exports = connectDatabase