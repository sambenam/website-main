const express = require('express')

const router = express.Router()

router.get('/list-page' , (req , res) =>
{
    res.render('list-page')
})
module.exports = router