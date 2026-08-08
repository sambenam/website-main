const User = require('./../model/registerModel')
class registerController {
    showForm(req,res) {
        res.render('sign-up')
    }

    async registerProcess(req, res) {
        try {
            const { name, email, password } = req.body

            if (!name || !email || !password) {
                return res.status(422).json({ message: 'نام، ایمیل و رمز عبور الزامی است.' })
            }
            if (String(password).length < 6) {
                return res.status(422).json({ message: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' })
            }

            const existing = await User.findOne({ email: email })
            if (existing) {
                return res.status(409).json({ message: 'این ایمیل قبلاً ثبت‌نام کرده است.' })
            }

            const addUser = new User({ name, email, password })
            await addUser.save()

            res.status(201).json({
                token: null, // TODO: با jsonwebtoken یک توکن واقعی صادر کن
                user: {
                    id: addUser._id,
                    name: addUser.name,
                    email: addUser.email,
                },
            })
        } catch (error) {
            res.status(422).json({ message: error.message })
        }
    }
}

module.exports = new registerController()