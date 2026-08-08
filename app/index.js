const express = require('express')
const path = require('path')
const ejs = require('ejs')
const bodyParser = require('body-parser')
const connectDatabase = require('./config/databaseConfig')

const app = express()

const homeRoutes = require('./routes/homeRoutes');
const aboutRoutes = require('./routes/aboutRoutes')
const supportRoutes = require('./routes/supportRoutes')
const signupRoutes = require('./routes/signup.Routes')
const authRoutes = require('./routes/authRoutes')
const userprofileRoutes = require('./routes/user-profileRoutes')
const listpageRoutes = require('./routes/listpageRoutes')
const checkoutsRoutes = require('./routes/checkoutRoutes')
const gateway = require('./routes/gateway.Routes')
const receiptRoutes = require('./routes/receipt.Routes')
const adminRoutes = require('./routes/admin.Routes')
const singleRoutes = require('./routes/single.post.Routes')



module.exports = class Application {
    constructor ()
    {
        this.setConfig();
        this.setRoutes();
        this.setdatabaseConfig()
    };

    setConfig()
    {
        
        app.use(express.static(path.join(__dirname  , './public')))
        app.set('view engine' , 'ejs');
        app.set('views',path.join(__dirname ,'views/html'))
        app.use(bodyParser.json())
        app.use(bodyParser.urlencoded({extended : true}))

       app.listen(3000 ,(err) =>
        {
            if(err) console.log(err)
                console.log('server run on port 3000')
        })

    }

    setRoutes()
    {
        app.use(homeRoutes)
        app.use(aboutRoutes)
        app.use(supportRoutes)
        app.use(signupRoutes)
        app.use(authRoutes)
        app.use(userprofileRoutes)
        app.use(listpageRoutes)
        app.use(checkoutsRoutes)
        app.use(gateway)
        app.use(receiptRoutes)
        app.use(adminRoutes)
        app.use(singleRoutes)
        app.use('/sigg',(req , res) =>
        {
            res.send(req.body.json)
        })


        
    }

    async setdatabaseConfig(){
        await connectDatabase()
    }
}