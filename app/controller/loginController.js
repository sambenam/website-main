const User = require('./../model/registerModel')

class loginController {
    showForm(req, res) {
        res.render('sign-up')
    }

    async loginProcess(req, res) {
        try {
            const { email, password } = req.body

            if (!email || !password) {
                return res.status(422).json({ message: 'ایمیل و رمز عبور الزامی است.' })
            }

            const user = await User.findOne({ email: email })

            // یک پیام یکسان برای «کاربر پیدا نشد» و «رمز اشتباه است» تا مشخص
            // نشود کدام ایمیل‌ها در سیستم ثبت شده‌اند.
            if (!user || user.password !== password) {
                return res.status(401).json({ message: 'ایمیل یا رمز عبور صحیح نیست.' })
            }

            res.status(200).json({
                token: null, // TODO: با jsonwebtoken یک توکن واقعی صادر کن
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                },
            })
        } catch (error) {
            res.status(500).json({ message: error.message })
        }
    }
}

module.exports = new loginController()
