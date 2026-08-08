const express = require('express') 

const router = express.Router()

router.get('/single-post' , (req , res) =>
{
    res.render('single-post')
})

module.exports = router