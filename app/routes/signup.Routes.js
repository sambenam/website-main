const express = require('express')
const registerController = require('./../controller/registerController')
const router = express.Router()

router.get('/sign-up' , registerController.showForm)

module.exports = router