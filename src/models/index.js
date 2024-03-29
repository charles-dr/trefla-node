const admin = require('./admin.model');
const adminNotification = require("./adminNotification.model");
const adminPermission = require('./adminPermission.model');
const appleToken = require('./appleToken.model');
const bug = require('./bug.model');
const chat = require('./chat.model');
const comment = require('./comment.model');
const commentLike = require('./commentLike.model');
const config = require('./config.model');
const emailTemplate = require('./emailTemplate.model');
const Guess = require('./Guess.model');
const identity = require('./identity.model');
const language = require('./lang.model');
const Match = require('./Match.model');
const MatchProfile = require('./MatchProfile.model');
const message = require('./message.model');
const notification = require('./notification.model');
const photo = require('./photo.model');
const pointTransaction = require('./pointTransaction.model');
const post = require('./post.model');
const postLike = require('./postLike.model');
const report = require('./report.model');
const user = require('./user.model');
const UserSetting = require('./UserSetting.model');


module.exports = {
  admin,
  adminNotification,
  adminPermission,
  appleToken,
  bug,
  chat,
  config,
  comment,
  commentLike,
  emailTemplate,
  Guess,
  identity,
  language,
  Match,
  MatchProfile,
  message,
  notification,
  photo,
  pointTransaction,
  post,
  postLike,
  report,
  user,
  UserSetting,
};
