const express = require('express')

const router = express.Router()

router.get('/checkouts' , (req , res) =>
{
    res.render('checkout')
})
module.exports = router