const { Validator } = require('node-input-validator');
const utf8 = require('utf8');
const User = require('../models/user.model');
const Post = require('../models/post.model');
const PostLike = require('../models/postLike.model');
const Notification = require('../models/notification.model');
const logger = require('../config/logger');

const models = require('../models/index');
const helpers = require('../helpers');
const libs = require('../libs');

const { BearerMiddleware } = require('../middlewares/basic.middleware');
const { getTokenInfo } = require('../helpers/auth.helpers');
const { chatPartnerId, JSONParser, respondValidateError } = require('../helpers/common.helpers');

const getPostSummary = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const limit = req.body.posts || 10;
  const offset = 0;

  const me = await models.user.getById(user_id);
  // const location_area = utf8.encode(req.body.location_area || me.location_area || "");
  const location_area = req.body.location_area || me.location_area || '';
  logger.info(`[Init LArea] ${location_area}`);

  return Post.pagination({ limit, offset, location_area }).then((posts) =>
    libs.populator.populatePosts(posts, { user_id })
  );
};

const getNotificationSummary = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const limit = req.body.notifications || 10;
  const offset = 0; //  as it's the first load

  let _notis = [],
    _users = {};
  return Notification.paginationByLastId({ limit, receiver_id: user_id })
    .then((notis) => {
      _notis = notis;
      let user_ids = [0];
      notis.forEach((noti) => {
        user_ids.push(noti.sender_id);
      });
      return User.getByIds(user_ids);
    })
    .then((users) => {
      users.forEach((user) => (_users[user.id] = user));
      _notis = _notis.map((noti) => Notification.output(noti));
      return _notis.map((noti) => ({
        ...noti,
        sender: User.output(_users[noti.sender_id]),
      }));
    });
};

const getInitDataWrapper = (req, res) => {
  return BearerMiddleware(req, res, () => {
    return getInitData(req, res)
      .then((result) => res.json(result))
      .catch((error) => respondValidateError(res, error));
  });
};

const getChatSummary = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  // let _all_chats = [], _total = 0;
  let _chatrooms;
  return models.chat
    .myChatrooms(user_id)
    .then((chatrooms) => {
      let idOfUsers = [0];
      chatrooms = chatrooms.filter((chat) => {
        const user_ids = JSON.parse(chat.user_ids);
        const myIndex = user_ids.indexOf(user_id);
        if (myIndex > 0 && myIndex < user_ids.length - 1) return false; // this is the previous owner of the card

        if (chat.accept_status === 1) {
          idOfUsers.push(myIndex == 0 ? user_ids[user_ids.length - 1] : user_ids[0]);
          return true;
        } else {
          myIndex === 0 ? null : idOfUsers.push(myIndex == 0 ? user_ids[user_ids.length - 1] : user_ids[0]);
          return myIndex === 0 ? false : true;
        }
      });
      _chatrooms = chatrooms;
      return Promise.all(idOfUsers.map((user_id) => models.user.getById(user_id)));
    })
    .then((users) => {
      users = users.filter((users) => !!users);
      let userObj = {};

      users.forEach((user) => {
        userObj[user.id.toString()] = user;
      });
      _chatrooms = _chatrooms.map((chat) => {
        const user_ids = JSON.parse(chat.user_ids);
        const myIndex = user_ids.indexOf(user_id);
        const partnerId = myIndex == 0 ? user_ids[user_ids.length - 1] : user_ids[0];
        return {
          ...models.chat.output(chat),
          user: models.user.output(userObj[partnerId]),
        };
      });
      return _chatrooms;
    });
};

const getChatSummryV2 = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  let _chatrooms;

  const me = await models.user.getById(user_id);
  const card_number = me.card_number;
  const [verifiedUser] = await models.user.getByCard(card_number, 1);

  return models.chat
    .allChatsOfUser(user_id, me.card_number)
    .then((chats) => {
      _chatrooms = chats.filter(async (chat) => {
        const user_ids = JSONParser(chat.user_ids);
        if (!chat.isForCard) return true;
        // allow all direct chats.
        else if (user_ids[0] === user_id) return true;
        // sender access to self-created chats
        else {
          return me.card_verified || (!me.card_verified && !verifiedUser); // verified or all unverified.
        }
      });
      let idOfUsers = [0];
      chats.forEach((chat, i) => {
        const user_ids = JSON.parse(chat.user_ids);
        const partnerId = user_ids[0] === user_id ? user_ids[1] || 0 : user_ids[0];
        partnerId ? idOfUsers.push(partnerId) : null;
      });
      return models.user.getByIds(idOfUsers);
    })
    .then(async (users) => {
      let userObj = {};
      users.forEach((user) => {
        if (user) {
          userObj[user.id.toString()] = user;
        }
      });
      _chatrooms = await Promise.all(
        _chatrooms.map(async (chat) => {
          const user_ids = JSONParser(chat.user_ids);
          const partnerId = user_ids[0] === user_id ? user_ids[1] || 0 : user_ids[0];
          chat = models.chat.output(chat);

          chat.preview_data = await helpers.common.populateChatSource(chat.sources, models);

          return {
            // ...(models.chat.output(chat)),
            ...chat,
            user: partnerId ? models.user.output(userObj[partnerId.toString()]) : null,
          };
        })
      );
      return _chatrooms;
    });
};

const getBlockList = async (user_id) => {
  return models.user
    .getById(user_id)
    .then((user) => {
      const blackList = JSON.parse(user.black_list || '[]');
      return models.user.getByIds(blackList);
    })
    .then((users) => users.map((user) => models.user.output(user)));
};

const getBlockerList = async (user_id) => {
  return models.user.getBlockers(user_id).then((users) => users.map((user) => models.user.output(user)));
};

const getInitData = (req, res) => {
  const { uid } = getTokenInfo(req);
  const validator = new Validator(req.body, {
    posts: 'required|integer',
    notifications: 'required|integer',
    // chat: "required|integer"
  });

  return validator
    .check()
    .then((matched) => {
      if (!matched) {
        throw Object.assign(new Error('Invalid request'), {
          code: 400,
          details: validator.errors,
        });
      }
    })
    .then(() => {
      return Promise.all([
        User.getById(uid),
        getPostSummary(req, res),
        getNotificationSummary(req, res),
        getChatSummryV2(req, res),
        getBlockList(uid),
        getBlockerList(uid),
      ]);
    })
    .then(([user, posts, notis, chats, black_list, blocked]) => {
      return {
        status: true,
        profile: user,
        posts,
        notifications: notis,
        chats,
        black_list,
        blocked,
      };
    });
  // .catch(error => error);
};

module.exports = getInitDataWrapper;
