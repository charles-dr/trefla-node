const { Validator } = require("node-input-validator");
const User = require("../models/user.model");
const EmailTemplate = require("../models/emailTemplate.model");
const { respondError, sendMail } = require("../helpers/common.helpers");
const {  
  comparePassword,
  generateUserData,
  genreateAuthToken,
  generatePassword,
} = require("../helpers/auth.helpers");

exports.register = (req, res) => {
  const userData = generateUserData(req.body);
  return generatePassword(userData.password)
    .then(encPassword => ({ ...userData, password: encPassword }))
    .then(user => User.create(user))
    .then(user => {
      return Promise.all([
        user,
        genreateAuthToken(user)
      ]);
    })
    .then(([user, token]) => res.json({
      status: true,
      message: 'success',
      data: User.output(user, 'PROFILE'),
      token
    }))
    .catch((error) => respondError(res, error));
};

exports.login = (req, res) => {
  return Promise.all([
    User.getByEmail(req.body.email_username),
    User.getByUserName(req.body.email_username),
  ])
    .then(([userByEmail, userByName]) => Promise.all([
      userByEmail || userByName,
      comparePassword(req.body.password, (userByEmail || userByName).password),
      genreateAuthToken(userByEmail || userByName),
      User.save({ ...(userByEmail || userByName), device_token: req.body.device_token })
    ]))
    .then(([ user, match, token ]) => {
      if (match) {
        return res.json({
          status: true,
          message: 'success',
          data: User.output(user, 'PROFILE'),
          token
        });
      } else {
        return res.status(400).json({
          status: false,
          message: 'Password does not match!',
        });
      }
    })
    .catch((error) => respondError(res, error));
};

exports.forgotPassword = (req, res) => {
  return Promise.all([
    User.getByEmail(req.body.email),
    EmailTemplate.getByIdentifier('forgot_password')
  ])
    .then(([user, et]) => {
      const emailConsent = et.body
        .replace(new RegExp('%Username%'), user.user_name)
        .replace(new RegExp('%code%'), req.body.code);
      return sendMail({
        from: 'trefla <admin@trefla.com>',
        to: user.email,
        subject: et.subject,
        body: emailConsent,
      });
    })
    .then(info => {
      if (info && info.messageId) {
        return res.json({
          status: true, 
          message: 'success', 
          data: {
            messageId: info.messageId
          }
        });
      } else {
        return res.json({
          status: false,
          message: 'failed',
          data: info
        });
      }
    })
    .catch((error) => respondError(res, error));
}

exports.resetPassword = (req, res) => {
  return Promise.all([
    User.getByEmail(req.body.email),
    generatePassword(req.body.password)
  ])
    .then(([ user, password ]) => {
      user.password = password;
      return User.save(user);
    })
    .then(user => res.json({
      status: true,
      message: 'success',
    }))
    .catch((error) => respondError(res, error));
}


