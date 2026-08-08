const express = require('express')
const registerController = require('./../controller/registerController')
const loginController = require('./../controller/loginController')
const router = express.Router()

// این دو مسیر همانی هستند که فرانت‌اند (scripts/api.js) با fetch صدا می‌زند.
// شکل و مسیرشان دقیقاً طبق docs/API_CONTRACT.md است.
router.post('/auth/register', registerController.registerProcess)
router.post('/auth/login', loginController.loginProcess)

module.exports = router
