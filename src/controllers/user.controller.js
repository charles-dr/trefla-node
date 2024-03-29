const { Validator } = require('node-input-validator');
const logger = require('../config/logger');
const CONSTS = require('../constants/socket.constant');
const NOTI_TYPES = require('../constants/notification.constant');
const { CARD_STATUS, LOGIN_MODE } = require('../constants/common.constant');
const { ADMIN_NOTI_TYPES } = require('../constants/notification.constant');
const Payments = require('../types/Payments');

const models = require('../models/index');
const User = require('../models/user.model');
const helpers = require('../helpers');
const { populator } = require('../libs');

const EmailTemplate = require('../models/emailTemplate.model');
const {
  filterAroundUsers,
  generateTZTimeString,
  JSONParser,
  JSONStringify,
  respondError,
  sendMail,
  timestamp,
} = require('../helpers/common.helpers');
const {
  comparePassword,
  generateUserData,
  genreateAuthToken,
  generatePassword,
  getTokenInfo,
} = require('../helpers/auth.helpers');

const activity = {
  notifyVerificationResult: async ({ user_id, users = [], senders = [] }) => {
    const _user = await models.user.getById(user_id);

    if (_user.device_token) {
      const body = {
        English: 'Your vechicle plate number has been successfully verified.',
        Romanian: 'Numărul de înmatriculare al autovehiculului tău a fost verificat cu succes.',
      };
      console.log('[Token]', _user.device_token);
      await helpers.common
        .sendSingleNotification({
          title: 'Trefla',
          body: body[_user.language],
          token: _user.device_token,
          data: {},
        })
        .catch((error) => logger.info(`[notifyVerification][Error]: ${error.message}`));
    }
  },
  notifyRejectionResult: async ({ user_id }) => {
    const user = await models.user.getById(user_id);
    if (user.device_token) {
      const message = {
        English: 'The registration number of your vehicle could not be verified. Please try again.',
        Romanian:
          'Numărul de înmatriculare al autovehiculului tău nu a putut fi verificat. Te rugăm să încerci din nou.',
      };
      await helpers.common
        .sendSingleNotification({
          title: 'Trefla',
          body: message[user.language],
          token: user.device_token,
        })
        .catch((error) => logger.info(`[notifyRejection][Error]: ${error.message}`));
    }
  },
  myAroundUsers: async ({ me, users = [] }) => {
    const pos = helpers.common.getUserLastLocation(me);
    return users.filter((user) => {
      const userPos = helpers.common.getUserLastLocation(user);
      const d = helpers.common.getDistanceFromLatLonInMeter(pos, userPos);
      const r = Number(me.users_around_radius);
      return d <= r;
    });
  },
  getChatPartnerIds: async (user_id) => {
    return models.chat
      .myChatrooms(user_id)
      .then((chatrooms) =>
        chatrooms.map((chat) => {
          const [partner] = JSON.parse(chat.user_ids).filter((id) => Number(id) !== Number(user_id));
          return partner;
        })
      )
      .then((partners) => partners.filter((id) => !!id).filter((id, i, self) => self.indexOf(id) === i))
      .catch((error) => {
        console.log('[User][PartnerIds][Error]', error);
        return [];
      });
  },
};

exports.register = async (req, res) => {
  let verifiedUser = null,
    new_number;
  new_number = req.body.card_number || '';
  let cardExists = false,
    verifiedUserWithCard = 0;

  if (new_number) {
    [verifiedUser] = await models.user.getByCard(new_number, 1);
    if (verifiedUser) {
      cardExists = true;
      verifiedUserWithCard = verifiedUser.id;
    }
  }

  const config = await models.config.getById(1);

  // if card is already verified, then user can't have that card.
  const userData = generateUserData({
    ...req.body,
    card_number: verifiedUser ? '' : new_number,
    users_around_radius: config.defaultUserRadiusAround,
  });
  if (userData.payments) {
    payments = new Payments(userData.payments);
    userData.payments = payments.toObject();
  }

  return generatePassword(userData.password)
    .then((encPassword) => {
      if (req.body.login_mode !== LOGIN_MODE.NORMAL && Object.keys(LOGIN_MODE).includes(req.body.login_mode)) {
        // social register.
        return {
          ...userData,
          password: '',
          social_pass: JSON.stringify({ [req.body.login_mode]: encPassword }),
        };
      } else {
        req.body.login_mode = LOGIN_MODE.NORMAL;
        return { ...userData, password: encPassword };
      }
    })
    .then(async (userModel) => {
      return User.create(userModel);
    })
    .then(async (user) => {
      // check if user has card number, if true, notify to the chat creator to the card.
      if (new_number && !verifiedUser) {
        let _chats = [];

        // notifies the card chat creators that a new user registered with card.
        await models.chat
          .getChatToCard({ card_number: user.card_number })
          .then((chats) => {
            _chats = chats;
            const sender_ids = chats.map((chat) => {
              const user_ids = JSON.parse(chat.user_ids);
              return user_ids[0];
            });
            return User.getByIds(sender_ids);
          })
          .then((senders) => {
            const socketClient = req.app.locals.socketClient;
            senders.forEach((sender, i) => {
              if (sender.socket_id) {
                socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
                  to: sender.socket_id,
                  event: CONSTS.SKT_REGISTER_WITH_CARD,
                  args: {
                    chat: {
                      ...models.chat.output(_chats[i]),
                      user: models.user.output(user),
                    },
                  },
                });
              }
            });
          });
      }
      return Promise.all([user, genreateAuthToken(user)]);
    })
    .then(([user, token]) => ({
      status: true,
      message: 'success',
      data: User.output(user, 'PROFILE'),
      token,
      cardVerified: {
        exists: cardExists,
        user_id: verifiedUserWithCard,
      },
    }));
};

exports.login = (req, res) => {
  return Promise.all([User.getByEmail(req.body.email_username), User.getByUserName(req.body.email_username)])
    .then(async ([userByEmail, userByName]) => {
      const user = userByEmail || userByName;
      // process password.
      let password;
      if (req.body.login_mode === LOGIN_MODE.NORMAL) {
        password = user.password;
      } else {
        const social_pass = JSON.parse(user.social_pass);
        password = social_pass[req.body.login_mode];

        if (password === undefined) {
          user.social_pass = JSON.stringify({
            ...social_pass,
            [req.body.login_mode]: await generatePassword(req.body.password),
          });
        }
      }
      // update some data.
      if (req.body.device_token) user.device_token = req.body.device_token;
      if (req.body.location_area) user.location_area = req.body.location_area;

      return Promise.all([
        user,
        req.body.login_mode !== LOGIN_MODE.NORMAL && !password ? true : comparePassword(req.body.password, password),
        genreateAuthToken(user),
        User.save(user),
        // req.body.device_token !== undefined ? User.save({
        //   ...user,
        //   device_token: req.body.device_token,
        //   location_area: req.body.location_area || user.location_area,
        // }) : null
      ]);
    })
    .then(([user, match, token, updatedUser]) => {
      if (match) {
        return res.json({
          status: true,
          message: 'success',
          data: User.output(updatedUser, 'PROFILE'),
          token,
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
  return Promise.all([User.getByEmail(req.body.email), EmailTemplate.getByIdentifier('forgot_password')])
    .then(([user, et]) => {
      const emailConsent = et.body
        .replace(new RegExp('%Username%'), user.user_name)
        .replace(new RegExp('%code%'), req.body.code);
      return Promise.all([
        sendMail({
          from: 'trefla <admin@trefla.com>',
          to: user.email,
          subject: et.subject,
          body: emailConsent,
        }),
        User.save({ ...user, recovery_code: req.body.code }),
      ]);
    })
    .then(([info, saved]) => {
      if (info && info.messageId) {
        return res.json({
          status: true,
          message: 'success',
          data: {
            code: req.body.code,
            messageId: info.messageId,
          },
        });
      } else {
        return res.json({
          status: false,
          message: 'failed',
          data: info,
        });
      }
    })
    .catch((error) => respondError(res, error));
};

exports.resetPassword = (req, res) => {
  return Promise.all([User.getByEmail(req.body.email), generatePassword(req.body.password)])
    .then(([user, password]) => {
      if (user.recovery_code !== req.body.code) {
        throw Object.assign(new Error('Recovery code does not match!'), { code: 400 });
      } else {
        user.password = password;
        user.recovery_code = '';
        return User.save(user);
      }
    })
    .then((user) =>
      res.json({
        status: true,
        message: 'success',
      })
    )
    .catch((error) => respondError(res, error));
};

exports.getById = (req, res) => {
  const { id: user_id } = req.params;
  return User.getById(user_id)
    .then((user) => {
      user = User.output(user, 'PROFILE');
      return res.json({
        status: true,
        message: 'success',
        data: user,
      });
    })
    .catch((error) => respondError(res, error));
};

exports.getProfile = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  return User.getById(user_id)
    .then((user) => {
      user = User.output(user, 'PROFILE');
      return res.json({
        status: true,
        message: 'success',
        data: user,
      });
    })
    .catch((error) => respondError(res, error));
};

exports.pagination = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  let sort = JSON.parse(req.query.sort);
  const keyword = req.query.keyword;

  const tblColumns = [
    'user_name',
    'image',
    'email',
    'sex',
    'birthday',
    'card_number',
    'location_address',
    'location_coordinate',
    'create_time',
    'active',
  ];

  return Promise.all([
    User.pagination({
      limit: req.query.limit || 10,
      page: req.query.page || 0,
      keyword,
      sort: { field: tblColumns[sort.col], desc: sort.desc },
    }),
    User.numberOfUsers({ keyword: req.query.keyword }),
  ])
    .then(([users, total]) =>
      res.json({
        status: true,
        message: 'success',
        data: users.map((user) => User.output(user, req.query.mode || 'PROFILE')), //.filter(user => user.id !== user_id)
        pager: {
          limit: Number(req.query.limit || 10),
          page: Number(req.query.page || 0),
          total,
        },
        hasMore: (req.query.page || 0) * (req.query.limit || 10) + users.length < total,
      })
    )
    .catch((error) => respondError(res, error));
};

exports.cardPagination = (req, res) => {
  const { uid, role } = getTokenInfo(req);
  let { limit, page } = req.query;
  page = Number(page);
  limit = Number(limit);
  return Promise.all([User.cardPagination({ limit, page }), User.numberOfCard()]).then(([users, total]) => {
    const hasMore = page * limit + users.length < total;
    return res.json({
      status: true,
      message: 'success',
      data: users.map((user) => User.output(user)),
      pager: {
        page,
        limit,
        total,
      },
      hasMore,
    });
  });
};

exports.updateProfile = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  let cardExists = false,
    verifiedUserWithCard = 0;

  let new_number = req.body['card_number'] || '';
  let old_number;
  let verifiedUser = null;
  let cardChats = [];

  // get verified user except
  if (new_number) {
    [verifiedUser] = await User.getByCard(new_number, 1);
    verifiedUser = verifiedUser && verifiedUser.id !== user_id ? verifiedUser : null;
  }

  return User.getById(user_id)
    .then(async (user) => {
      old_number = user.card_number || '';
      if (req.body.card_number === undefined) {
        new_number = old_number;
      }

      const keys = Object.keys(user);
      keys.forEach((key) => {
        // update fields except card number.
        if (req.body[key] !== undefined && ['card_number', 'login_mode'].includes(key)) {
          // skip these field.
        } else if (req.body[key] !== undefined && ['location_array'].includes(key)) {
          user[key] = JSON.stringify(req.body[key]);
        } else if (key === 'profile_done') {
          user.profile_done = req.body.profile_done !== undefined ? Number(req.body.profile_done) : user.profile_done;
        } else {
          user[key] = req.body[key] !== undefined ? req.body[key] : user[key];
        }
      });

      // when user gonna update card_number
      if (new_number !== old_number && !verifiedUser) {
        // when there is no verified user, it's possible to update card. But with unverified status.
        user.card_number = new_number;

        // update user with card chats changes;
        if (user.socket_id) {
          const socketClient = req.app.locals.socketClient;
          await Promise.all([
            models.chat.getChatToCard({ card_number: old_number }),
            models.chat.getChatToCard({ card_number: new_number }),
          ])
            .then(([oldChats, newChats]) => {
              const sender_ids = [0];
              newChats.forEach((chat) => {
                const user_ids = JSON.parse(chat.user_ids);
                sender_ids.push(user_ids[0]);
              });
              return Promise.all([oldChats, newChats, models.user.getByIds(sender_ids)]);
            })
            .then(([oldChats, newChats, senders]) => {
              const userObj = {};
              senders.forEach((user) => {
                userObj[user.id.toString()] = user;
              });

              const added = newChats.map((chat) => {
                const sender_id = JSON.parse(chat.user_ids)[0];
                return {
                  ...models.chat.output(chat),
                  user: models.user.output(userObj[sender_id.toString()]),
                };
              });

              const removed = oldChats.map((chat) => chat.id);

              socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
                to: user.socket_id,
                event: CONSTS.SKT_CHATLIST_UPDATED,
                args: {
                  removed,
                  added,
                },
              });
            });
        }

        // if user is already verified with other number, all related card chats will be unverified.
        if (user.card_verified) {
          await models.chat.unverifyChatsByCard({ card_number: old_number });
        }
        user.card_verified = 0;
      }

      return User.save(user);
    })
    .then(async (newUser) => {
      if (new_number && new_number !== old_number && verifiedUser) {
        cardExists = true;
        verifiedUserWithCard = verifiedUser.id;
      }

      return res.json({
        status: true,
        message: 'Profile has been updated!',
        data: User.output(newUser, 'PROFILE'),
        cardVerified: {
          exists: cardExists,
          user_id: verifiedUserWithCard,
        },
      });
    })
    .catch((error) => respondError(res, error));
};

exports.updateById = (req, res) => {
  const { id } = req.params;
  const { uid, role } = getTokenInfo(req);

  return User.getById(id)
    .then((user) => {
      const keys = Object.keys(user);
      keys.forEach((key) => {
        if (key === 'payments') {
          const payments = new Payments(req.body.payments);
          user.payments = payments.toObject();
        } else if (['location_array'].includes(key)) {
          user[key] = req.body[key] ? JSON.stringify(req.body[key]) : user[key];
        } else {
          user[key] = req.body[key] !== undefined ? req.body[key] : user[key];
        }
      });
      return User.save(user);
    })
    .then((newUser) => {
      return res.json({
        status: true,
        message: 'User has been updated!',
        data: User.output(newUser, 'PROFILE'),
      });
    });
};

exports.deleteByIdReq = (req, res) => {
  let user_id = Number(req.params.id);
  const { chat, comment, friend, post, report } = req.body.options || {};
  let _deleted = false;
  return models.user
    .deleteById(user_id)
    .then((deleted) => {
      _deleted = deleted;
      if (!deleted) {
        throw Object.assign(new Error('Failed to delete user!'), { code: 400 });
      }
      return Promise.all([
        chat ? models.chat.deleteByUser(user_id) : null,
        comment ? models.comment.deleteByUser(user_id) : null,
        post ? models.post.deleteByUser(user_id) : null,
        // friend ? m
      ]);
    })
    .then(([deleteChat, deleteComment, deletePost]) => {
      return {
        status: true,
        message: 'User has been deleted!',
      };
    });
};

exports.verifyUserReq = (req, res) => {
  const user_id = Number(req.params.id);

  let _user, _card_number;
  return User.getById(user_id)
    .then((user) => {
      if (!user.card_number && !user.card_img_url) {
        throw Object.assign(new Error("User doesn't have card information!"), { code: 400 });
      }
      _user = user;
      _card_number = user.card_number;
      return Promise.all([
        models.user.getByCard(user.card_number),
        models.chat.getChatToCard({ card_number: user.card_number }),
      ]);
    })
    .then(([users, chats]) => {
      return Promise.all([manageVerificationStatusOfUsers(users, user_id), processChatroomToCard(chats, user_id)]);
    })
    .then(async ([users, chats]) => {
      // const [verifiedUser] = cardUsers.filter(user => user.id === user_id);
      const sender_ids = chats
        .map((chat) => {
          const user_ids = JSON.parse(chat.user_ids);
          return user_ids[0];
        })
        .filter((item, i, ar) => ar.indexOf(item) === i);

      // send socket message to the creator of card chat.
      await models.user.getByIds(sender_ids).then((senders) => {
        const socketClient = req.app.locals.socketClient;
        senders.forEach((sender, i) => {
          if (sender.socket_id) {
            // get card chat sender triggered.
            const [chat] = chats.filter((chat) => {
              const user_ids = typeof chat.user_ids === 'string' ? JSON.parse(chat.user_ids) : chat.user_ids;
              return user_ids[0] === sender.id;
            });

            // notify the card chat creators that a user has been verified on interesting card number,
            socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
              to: sender.socket_id,
              event: CONSTS.SKT_CARD_VERIFIED,
              args: {
                chat: {
                  ...models.chat.output(chat),
                  user: models.user.output(_user),
                },
              },
            });
          }
        });
      });
      return {
        status: true,
        message: 'success',
        verified: users,
        chatrooms: chats,
      };
    });
};

exports.verifyUser = ({ user_id, socketClient }) => {
  // const user_id = Number(req.params.id);

  let _user, _card_number;
  return User.getById(user_id)
    .then((user) => {
      console.log('[verifying user]', user_id);
      if (!user.card_number && !user.card_img_url) {
        throw Object.assign(new Error("User doesn't have card information!"), { code: 400 });
      }
      _user = user;
      _card_number = user.card_number;
      return Promise.all([
        models.user.getByCard(user.card_number),
        models.chat.getChatToCard({ card_number: user.card_number }),
      ]);
    })
    .then(([users, chats]) => {
      return Promise.all([
        manageVerificationStatusOfUsers(users, user_id),
        chats.length ? processChatroomToCard(chats, user_id) : [],
      ]);
    })
    .then(async ([users, chats]) => {
      [_user] = users.filter((user) => user.id === user_id); // update user after verification

      // const [verifiedUser] = cardUsers.filter(user => user.id === user_id);
      const sender_ids = chats
        .map((chat) => {
          const user_ids = JSON.parse(chat.user_ids);
          return user_ids[0];
        })
        .filter((item, i, ar) => ar.indexOf(item) === i);

      // add notification to the new owner
      const notiModel = helpers.model.generateNotificationData({
        isFromAdmin: 1,
        sender_id: 0,
        receiver_id: user_id,
        type: NOTI_TYPES.cardVerifyRequestAcceptNotiType,
        optional_val: _card_number,
        time: generateTZTimeString(),
      });
      const notification = await models.notification.create(notiModel);
      _user.noti_num++;
      await models.user.save(_user);

      if (_user.socket_id) {
        socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
          to: _user.socket_id,
          event: CONSTS.SKT_NOTI_NUM_UPDATED,
          args: {
            num: _user.noti_num,
            notification,
          },
        });
      }

      users
        .filter((user) => user.id !== user_id)
        .forEach(async (user) => {
          const notiModel = helpers.model.generateNotificationData({
            isFromAdmin: 1,
            sender_id: 0,
            receiver_id: user.id,
            type: NOTI_TYPES.cardVerifyRequestRejectNotiType,
            optional_val: _card_number,
            time: generateTZTimeString(),
            text: 'Other user has been verified.',
          });
          const notification = await models.notification.create(notiModel);
          user.noti_num++;
          await models.user.save(user);
          if (user.socket_id) {
            socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
              to: user.socket_id,
              event: CONSTS.SKT_NOTI_NUM_UPDATED,
              args: {
                num: user.noti_num,
                notification,
              },
            });
          }
        });

      const senders = await models.user.getByIds(sender_ids.length ? sender_ids : [0]);

      console.log('[chat.list.updated] --->');
      users
        .filter((user) => user.socket_id)
        .forEach((user) => {
          console.log('[chatlist]', user.id, user.user_name, user.card_verified);
          const removed = [];
          const added = [];

          if (user.id === user_id) {
            console.log('[chat list]  added');
            socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
              to: user.socket_id,
              event: CONSTS.SKT_CHATLIST_UPDATED,
              args: {
                added: chats.map((chat) => ({
                  ...models.chat.output(chat),
                  user: models.user.output(senders[JSONParser(chat.user_ids)[0].toString()]),
                })),
                removed: [],
                your_name: user.user_name,
              },
            });
          } else {
            console.log('[chat list]  removed');
            socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
              to: user.socket_id,
              event: CONSTS.SKT_CHATLIST_UPDATED,
              args: {
                removed: chats.map((chat) => chat.id),
                added: [],
                your_name: user.user_name,
              },
            });
          }
        });

      // send socket message to the creator of card chat.
      // await models.user.getByIds(sender_ids)
      //   .then(senders => {
      // const socketClient = req.app.locals.socketClient;
      senders.forEach((sender, i) => {
        if (sender.socket_id) {
          // get card chat sender triggered.
          const [chat] = chats.filter((chat) => {
            const user_ids = typeof chat.user_ids === 'string' ? JSON.parse(chat.user_ids) : chat.user_ids;
            return user_ids[0] === sender.id;
          });

          // notify the card chat creators that a user has been verified on interesting card number,
          socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
            to: sender.socket_id,
            event: CONSTS.SKT_CARD_VERIFIED,
            args: {
              chat: {
                ...models.chat.output(chat),
                user: models.user.output(_user),
              },
            },
          });
        }
      });
      // })

      await activity.notifyVerificationResult({ user_id });

      return {
        status: true,
        message: 'success',
        verified: users,
        chatrooms: chats,
      };
    });
};

exports.unverifyUserReq = (req, res) => {
  const { id: user_id } = req.params;
  let _user;
  return User.getById(user_id)
    .then((user) => {
      const { card_number, card_verified } = user;
      user.card_verified = 0;
      return Promise.all([User.save(user), models.chat.getChatToCard(card_number)]);
    })
    .then(async ([user, cardChats]) => {
      if (cardChats.length) {
        return unverifyCardChats(cardChats);
        // return Promise.all(cardChats.map(chat => models.chat.save({ ...chat, card_verified: 0 })));
      }
      await activity.notifyRejectionResult({ user_id });
    })
    .then(() => ({
      status: true,
      message: 'User has been unverified!',
    }));
};

/**
 * @description reject the driver id (card) of a user.
 * @param {Integer} user_id
 * @param {String} reason
 * @param {SocketInstance} socketClient
 * @workflow
 *  - update the card_verified -> CARD_STATUS.REJECTED
 *  - add a notification with text(reason) (socket also)
 *  - send a socket about rejection.
 *  - send a push notification to the user.
 */
exports.rejectIdVerification = async ({ user_id, reason, socketClient }) => {
  const addRejectionNotification = async ({ user, card_number }) => {
    const notiModel = helpers.model.generateNotificationData({
      isFromAdmin: 1,
      sender_id: 0,
      receiver_id: user.id,
      type: NOTI_TYPES.cardVerifyRequestRejectNotiType,
      optional_val: card_number,
      time: generateTZTimeString(),
      text: `Administrator rejected your vehicle number ${card_number}.`,
    });

    const notification = await models.notification.create(notiModel);
    // increase noti number;
    user.noti_num++;
    await models.user.save(user);

    // send socket about new notification.
    if (user.socket_id) {
      socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
        to: user.socket_id,
        event: CONSTS.SKT_NOTI_NUM_UPDATED,
        args: {
          num: user.noti_num,
          notification,
        },
      });
    }
  };

  return models.user.getById(user_id).then(async (user) => {
    const card_number = user.card_number;
    user.card_verified = CARD_STATUS.REJECTED;
    user.update_time = timestamp();

    // update the user.
    await models.user.save(user);

    // notification & socket.
    await addRejectionNotification({ user, card_number });

    // update chat verification.
    await models.chat.getChatToCard(card_number).then((chats) => {
      if (chats.length) {
        return unverifyCardChats(chats);
      }
    });

    // socket

    // push notification.
    await activity.notifyRejectionResult({ user_id: user.id });
    return {
      status: true,
      message: 'You rejected a user card number!',
      data: user,
    };
  });
};

exports.banReplyReq = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);

  return User.getById(user_id)
    .then((user) => {
      user.ban_reply = req.body.reply;
      return User.save(user);
    })
    .then((user) => ({
      status: true,
      message: 'Thank you! We will get back to you soon.',
    }));
};

exports.blockUser = ({ fromId, toId, socketClient }) => {
  let blocker;
  return models.user
    .getById(fromId)
    .then((fromUser) => {
      let blackList = helpers.common.JSONParser(fromUser.black_list);
      if (typeof blackList !== 'object') blackList = [];
      if (!blackList.includes(toId)) blackList.push(toId);
      fromUser.black_list = blackList;
      return models.user.save(fromUser);
    })
    .then((fromUser) => {
      blocker = fromUser;
      let blackList = helpers.common.JSONParser(fromUser.black_list);
      if (typeof blackList !== 'object') blackList = [];
      return models.user.getByIds(blackList);
    })
    .then((blockers) => {
      const [blockee] = blockers.filter((user) => user.id === toId);
      if (blockee && blockee.socket_id) {
        socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
          users: blockee.socket_id,
          event: CONSTS.SKT_BLOCK_BLOCKED,
          args: {
            message: 'You got blocked!',
            user: User.output(blocker),
          },
        });
      }
      return {
        status: true,
        message: `You blocked '${blockee.user_name}'`,
        black_list: blockers.map((user) => models.user.output(user)),
      };
    });
};

exports.unblockUser = ({ fromId, toId, socketClient }) => {
  let blocker;
  return models.user
    .getById(fromId)
    .then((fromUser) => {
      let blackList = helpers.common.JSONParser(fromUser.black_list || '[]');
      if (blackList.includes(toId)) blackList.splice(blackList.indexOf(toId), 1);
      fromUser.black_list = blackList;
      return models.user.save(fromUser);
    })
    .then((fromUser) => {
      blocker = fromUser;
      let blackList = helpers.common.JSONParser(fromUser.black_list);
      if (typeof blackList !== 'object') blackList = [];
      return Promise.all([models.user.getByIds(blackList), models.user.getById(toId)]);
    })
    .then(([blockers, blockee]) => {
      if (blockee && blockee.socket_id) {
        socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
          users: blockee.socket_id,
          event: CONSTS.SKT_BLOCK_BLOCKED,
          args: {
            message: 'You got unblocked!',
            user: User.output(blocker),
          },
        });
      }
      return {
        status: true,
        message: `You unblocked '${blockee.user_name}'`,
        black_list: blockers.map((user) => models.user.output(user)),
      };
    });
};

exports.createIDTransferReq = async ({ user_id, card_number, socketClient }) => {
  let _user, verifiedUser;
  [verifiedUser] = await models.user.getByCard(card_number, 1);

  return User.getById(user_id)
    .then((user) => {
      _user = user;

      // add notification for admin.
      const adminNotiModel = helpers.model.generateAdminNotiData({
        type: ADMIN_NOTI_TYPES.ID_TRANSFER,
        payload: {
          from: verifiedUser.id,
          to: user.id,
          card_number,
        },
      });

      // add a notification for origin owner
      const notiModel = helpers.model.generateNotificationData({
        sender_id: user_id,
        receiver_id: verifiedUser.id,
        type: NOTI_TYPES.cardTransferRequestNotiType,
        optional_val: card_number,
      });

      // increase noti_num of the verified user.
      verifiedUser.noti_num++;

      return Promise.all([
        models.user.save(verifiedUser),
        models.notification.create(notiModel),
        models.adminNotification.create(adminNotiModel),
      ]);
    })
    .then(([owner, notification, adminNoti]) => {
      // send socket to owner
      if (verifiedUser.socket_id) {
        socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
          to: verifiedUser.socket_id,
          event: CONSTS.SKT_NOTI_NUM_UPDATED,
          args: {
            num: verifiedUser.noti_num,
            notification: {
              ...models.notification.output(notification),
              sender: models.user.output(_user),
            },
          },
        });
      }
      return {
        status: true,
        message: 'You request has been received!',
      };
    });
};

exports.replyToTransferRequest = async ({ user_id, noti_id, accept, socketClient, ...args }) => {
  let _user, _notification;
  return Promise.all([models.user.getById(user_id), models.notification.getById(noti_id)])
    .then(([user, notification]) => {
      _user = user;
      _notification = notification;
      if (user.card_number !== notification.optional_val || notification.receiver_id !== user_id) {
        throw Object.assign(new Error('You have no permission to reply this request!'));
      }
      return models.user.getById(notification.sender_id);
    })
    .then((sender) => {
      if (!sender) throw Object.assign(new Error('Transfer requester has been deleted!'));
      // notification
      const notiModel = helpers.model.generateNotificationData({
        sender_id: user_id,
        receiver_id: sender.id,
        type: accept ? NOTI_TYPES.cardTransferRequestAcceptNotiType : NOTI_TYPES.cardTransferRequestRejctNotiType,
        optional_val: _notification.optional_val,
      });

      _user.noti_num++;

      return Promise.all([
        sender,
        models.notification.create(notiModel),
        models.adminNotification.deleteTransferRequest({ from: sender.id, to: user_id }),
        models.user.save(_user),
      ]);
    })
    .then(async ([sender, notification, adminNoti, me]) => {
      // socket to requester.
      if (sender.socket_id) {
        socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
          to: sender.socket_id,
          event: CONSTS.SKT_NOTI_NUM_UPDATED,
          args: {
            num: _user.noti_num,
            notification: {
              ...models.notification.output(notification),
              sender: models.user.output(_user),
            },
          },
        });
      }

      if (accept) {
        sender.card_number = notification.optional.val;
        await models.user.save(sender);
        await this.verifyUser({ user_id, socketClient });

        // check change of card chat list
        if (_user.socket_id || sender.socket_id) {
          await Promise.all([
            _user.card_number ? models.chat.getChatToCard({ card_number: _user.card_number }) : [],
            models.chat.getChatToCard({ card_number: notification.optional_val }),
          ])
            .then(([oldChats, newChats]) => {
              const sender_ids = [0];
              newChats.forEach((chat) => {
                const user_ids = JSON.parse(chat.user_ids);
                sender_ids.push(user_ids[0]);
              });
              return Promise.all([oldChats, newChats, models.user.getByIds(sender_ids)]);
            })
            .then(([oldChats, newChats, senders]) => {
              const userObj = {};
              senders.forEach((user) => {
                userObj[user.id.toString()] = user;
              });

              // send socket to the requester
              if (sender.socket_id) {
                socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
                  to: sender.socket_id,
                  event: CONSTS.SKT_CHATLIST_UPDATED,
                  args: {
                    added: newChats.map((chat) => {
                      const sender_id = JSON.parse(chat.user_ids)[0];
                      return {
                        ...models.chat.output(chat),
                        user: models.user.output(userObj[sender_id.toString()]),
                      };
                    }),
                    removed: oldChats.map((chat) => chat.id),
                  },
                });
              }

              if (sender.socket_id) {
                socketClient.emit(CONSTS.SKT_LTS_SINGLE, {
                  to: sender.socket_id,
                  event: CONSTS.SKT_CHATLIST_UPDATED,
                  args: {
                    added: [],
                    removed: newChats.map((chat) => chat.id),
                  },
                });
              }
            });
        }
      }

      return {
        status: true,
        message: 'You replied to the card transfer request!',
      };
    });
};

exports.createVerifyIdReq = async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  let _user;
  return models.user
    .getById(user_id)
    .then((user) => {
      if (!user) throw Object.assign(new Error('User does not exist!'), { code: 400 });
      if (!user.card_number) throw Object.assign(new Error('No valid card number found!'), { code: 400 });
      if (user.card_verified) throw Object.assign(new Error("You're already verified!"), { code: 400 });
      _user = user;

      const verifyReqModel = helpers.model.generateAdminNotiData({
        type: ADMIN_NOTI_TYPES.VERIFY_ID,
        payload: { user_id, card_number: user.card_number },
        emails: [],
      });
      return models.adminNotification.create(verifyReqModel);
    })
    .then((adminNoti) => {
      return {
        status: true,
        message: 'We received your request!',
      };
    });
};

exports.getUsersInMyArea = async (req, res) => {
  let { page, limit } = req.query;
  page = Number(page || 0);
  limit = Number(limit || 50);

  const config = await models.config.getById(1);

  const { uid: user_id } = getTokenInfo(req);
  const contacts = await activity.getChatPartnerIds(user_id);
  return models.user.getById(user_id).then((me) => {
    let { location_area } = me;
    location_area = location_area || '___';
    const extraConditions = [`id != ${user_id}`, `isGuest=${me.isGuest}`];
    if (contacts.length > 0) {
      extraConditions.push(`id NOT IN (${contacts.join(',')})`);
    }

    return models.user
      .numberOfUsers({ location_area, extraConditions })
      .then((total) => models.user.pagination({ page: 0, limit: total, location_area, extraConditions }))
      .then((users) => {
        return activity.myAroundUsers({ me, users });
      })
      .then((users) => {
        const usersF = users.map((user) => ({
          distance: Number(
            helpers.common
              .getDistanceFromLatLonInMeter(
                helpers.common.getUserLastLocation(user),
                helpers.common.getUserLastLocation(me)
              )
              .toFixed(1)
          ),
          ...models.user.output(user),
        }));
        return res.json({
          status: true,
          message: 'success',
          data: usersF,
          hasMore: false,
        });
      });
  });
};

exports.searchUsersReq = async (req, res) => {
  const { query, last_id, limit } = req.body;
  return Promise.all([
    models.user.searchByQuery(query, { last_id, limit }),
    models.user.lastUserForQuery(query),
    models.user.totalForQuery(query),
  ]).then(async ([users, lastUser, total]) => {
    const data = await populator.populateUsers(users);
    const cLastId = users.length > 0 ? users[users.length - 1].id : 0;
    return res.json({
      status: true,
      message: 'success',
      data,
      pager: {
        last_id: cLastId,
        limit,
        total,
      },
      hasMore: cLastId > lastUser.id,
    });
  });
};

const manageVerificationStatusOfUsers = (users, user_id) => {
  const card_number = users[0].card_number;
  return Promise.all(
    users.map((user) =>
      User.save({
        ...user,
        card_verified: user.id === user_id ? 1 : 0,
        card_number: user.id === user_id ? card_number : '',
        card_img_url: user.id === user_id ? user.card_img_url : '',
      })
    )
  )
    .then((users) => users)
    .catch((error) => {
      console.log('[Users verify status] error', error);
      return false;
    });
};

const processChatroomToCard = async (chats, user_id) => {
  const user = await User.getById(user_id);

  return Promise.all(
    chats.map(async (chat) => {
      const chat_users = JSON.parse(chat.user_ids);
      const isTransfer = false; // chat_users.length > 1;

      let updateData = {};
      if (!isTransfer) {
        updateData = {
          user_ids: JSON.stringify([chat_users[0], user_id]),
        };
      } else if (chat_users[chat_users.length - 1] !== user_id) {
        console.log('[ID Transfer] acceptable');
        const lastMsg = await models.message.lastMsgInChat(chat.id);
        const lastMsgIdOnTransfer = JSON.parse(chat.lastMsgIdOnTransfer || '[]');
        const last_messages = JSON.parse(chat.last_messages || '[]');
        updateData = checkDuplicatedOwner({
          user_ids: [...chat_users, user_id],
          isTransfered: true,
          lastMsgIdOnTransfer: [...lastMsgIdOnTransfer, lastMsg ? lastMsg.id : 0],
          last_messages: [
            ...last_messages,
            {
              msg: lastMsg.message,
              time: lastMsg.time,
            },
          ],
        });
      } else {
        console.log('[ID transfer] same id with last owner!');
        updateData = {
          card_number: chat.card_number,
        };
      }
      updateData.id = chat.id;
      updateData.card_verified = 1;

      return Promise.all([models.chat.save(updateData), models.message.updateReceiverInCardChat(chat.id, user_id)]);
    })
  )
    .then(([[chat]]) => [chat])
    .then((chats) => {
      console.log(
        '[processChatroomToCard]',
        chats.map((it) => it.id)
      );
      return chats;
    })
    .catch((error) => {
      console.log('[Process card chats] error', error);
      return false;
    });
};

const checkDuplicatedOwner = (data) => {
  let { user_ids, isTransfered, lastMsgIdOnTransfer, last_messages } = data;
  const current_owner = user_ids[user_ids.length - 1];
  if (user_ids.length > 3) {
    let dupId = user_ids.indexOf(current_owner);
    if (dupId > 0 && dupId < user_ids.length - 1) {
      user.ids.splice(dupId, 1);
      lastMsgIdOnTransfer.splice(dupId - 2, 1);
      last_messages.splice(dupId - 1, 1);
    }
  }
  return {
    user_ids: JSON.stringify(user_ids),
    isTransfered,
    lastMsgIdOnTransfer: JSON.stringify(lastMsgIdOnTransfer),
    last_messages: JSON.stringify(last_messages),
  };
};

const unverifyCardChats = (chats) => {
  return Promise.all(
    chats.map((chat) => {
      chat.card_verified = 0;
      const user_ids = JSONParser(chat.user_ids);
      chat.user_ids = JSONStringify([user_ids[0]]);

      return Promise.all([models.chat.save(chat), models.message.updateReceiverInCardChat(chat.id, 0)]);
    })
  ).then(([[chat, updated]]) => [chat]);
};

const generateUsername = async (username) => {
  if (username.includes('@')) username = username.split('@')[0];

  return User.getByUserName(username).then((user) => {
    if (!user) return username;
    else return generateUsername(username + helpers.common.generateRandomString(3));
  });
};

exports.generateUsername = generateUsername;
