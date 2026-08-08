const express = require('express')

const router = express.Router()

router.get('/gateway' , (req , res) =>
{
    res.render('gateway')
})
module.exports = router