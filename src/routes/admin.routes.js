const express = require("express");
const { Validator } = require("node-input-validator");
const adminRouters = express.Router();

const ctrls = require("../controllers");
const models = require("../models");
const helpers = require("../helpers");
const middlewares = require("../middlewares/basic.middleware");
const config = require('../config/app.config');

const { BearerMiddleware } = require("../middlewares/basic.middleware");
const { getTokenInfo } = require('../helpers/auth.helpers');
const { respondValidateError } = require("../helpers/common.helpers");
const { ADMIN_NOTI_TYPES } = require("../constants/notification.constant");
const { ADMIN_ROLE } = require('../constants/common.constant');

const activity = {
  checkAdminPermission: async (req, identifier) => {
    const { role, role2, uid } = getTokenInfo(req);
    
    if (role !== 'ADMIN') return false;
    if (role2 === ADMIN_ROLE.SUPER) return true;

    const permission = models.adminPermission.output(await models.adminPermission.getByUserId(uid));
    return activity.checkAllowed(permission, identifier);
  },
  checkAllowed: (permission, identifier = null) => {
    if (typeof identifier === 'boolean') return identifier;
    else if (identifier === null || identifier === '' || identifier === undefined) return true;
    
    const keys = identifier.split('.');
    if (keys.length === 1) return permission[keys[0]];
    else if (keys.length === 2) return permission[keys[0]][keys[1]];
    else if (keys.length === 3) return permission[keys[0]][keys[1]][keys[2]];
    else if (keys.length === 4) return permission[keys[0]][keys[1]][keys[2]][keys[3]];
    return false;
  },
};


adminRouters.post('/login', async (req, res) => {

  middlewares.basicMiddleware(req, res, () => {
    const validator = new Validator(req.body, {
      email_or_name: "required",
      password: "required|minLength:5"
    });

    return validator.check()
      .then(matched => {
        if (!matched) {
          throw Object.assign(new Error('Validation failed!'), { code: 400, details: validator.errors });
        }
        return ctrls.admin.loginReq(req, res);
      })
      .then((result) => {
        return res.json(result);
      })
      .catch(error => respondValidateError(res, error));
  })  
});

// Bearer authentication
adminRouters.use((req, res, next) => {
  BearerMiddleware(req, res, next);
});

adminRouters.route('/authenticate-token').post(async (req, res) => {
  const { uid: user_id, role } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!"});
  const token = (req.headers.authorization || '').split(' ')[1] || '';
  return ctrls.admin.authenticateAdminToken(user_id) 
    .then(resl => res.json({ ...resl, token }))
    .catch(error => respondValidateError(res, error));
});


adminRouters.get('/profile', async (req, res) => {
  const { uid: user_id, role } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!"});

  return ctrls.admin.getAdminById(user_id)
    .then(admin => {
      return res.json({
        status: true,
        message: 'success',
        data: models.admin.output(admin),
      });
    })
    .catch(error => respondValidateError(res, error));
})

/**@secured by admin types */
adminRouters.get('/config', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'settings.config');
  if (!permitted) return res.json({ status: false, message: "Permission denied!" });

  return ctrls.admin.getAdminConfigReq()
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**
 * @for test only
 */
adminRouters.get('/firebase', async (req, res) => {
  console.log('[GET] /admin/firebase');
  return ctrls.firebase.test()
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.get('/id-transfers/:id', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.idTransfer.show');
  if (!permitted) return res.json({ status: false, message: "Permission denied!" });


  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.adminNotification.getById(provider.inputs.id)
      .then(adminNoti => {
        if (!adminNoti) provider.error('id', 'custom', 'Data does not exist!');
      })
  })

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.getIdTransferById(req.params.id);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/** @secrued by admin types */
adminRouters.get('/id-transfers', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.idTransfer.show');
  if (!permitted) return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.query,
  }, {
    page: "required|integer",
    limit: "required|integer",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.getIdTransfersReq(req.query);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});



///////////////////////////////////////////////////////////
//                                                       //
//            E M A I L   T E M P L A T E                //
//                                                       //
///////////////////////////////////////////////////////////


/** @secured by admin types  */
adminRouters.route('/email-templates/:id').get(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'settings.emailTemplate');
  if (!permitted) return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.params,
  }, {
    id: "required|integer",
  });

  validator.addPostRule(provider => {
    return models.emailTemplate.getById(provider.inputs.id)
      .then(et => {
        if (!et) provider.error('id', 'custom', 'Email template does not exist!');
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.getEmailTemplateById(req.params.id)
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/email-templates/:id').patch(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'settings.emailTemplate');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.params,
  }, {
    id: "required|integer",
  });

  validator.addPostRule(provider => {
    return models.emailTemplate.getById(provider.inputs.id)
      .then(et => {
        if (!et) provider.error('id', 'custom', `Email template with id "${provider.inputs.id}" does not exist!`);
      })
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error('Invalid request!'), { code: 400, details: validator.errors});
      return ctrls.admin.updateEmailTemplateById(req.params.id, req.body);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
})

/**@secured by admin types */
adminRouters.get('/email-templates', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'settings.emailTemplate');
  if (!permitted) return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.query,
  }, {
    page: "required|integer",
    limit: "required|integer",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors});
      return ctrls.admin.getEmailTemplateReq(req.query);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});



///////////////////////////////////////////////////////////
//                                                       //
//                   L A N G U A G E                     //
//                                                       //
///////////////////////////////////////////////////////////


/**@secured by admin types */
adminRouters.route('/langs/:id/content').get(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.edit');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required"
  });

  validator.addPostRule(provider => {
    return models.language.getById(provider.inputs.id)
      .then(lang => {
        if (!lang) {
          provider.error('id', 'custom', 'Lang does not exist!');
        } else if (!lang.url) {
          provider.error('url', 'custom', 'Language does not have url!');
        }        
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.language.getFileContent(req.params.id);
    })
    .then(result => res.send(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs/:id/sync').post(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.async');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.language.getById(provider.inputs.id)
      .then(lang => {
        if (!lang) provider.error('id', 'custom', 'Language does not exist!');
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.language.syncLangReq(req.params.id);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs/:id').get(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.edit');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors});
      return ctrls.language.getByIdReq(req.params.id)
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs/:id').patch(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.edit');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required|integer",
  });

  validator.addPostRule(provider => {
    return models.language.getById(provider.inputs.id)
      .then(lang => {
        if (!lang) provider.error('id', 'custom', `Language with id "${provider.inputs.id}" does not exist!`);
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors});
      return ctrls.language.updateLangById(req.params.id, req.body);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs/:id').delete(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.delete');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.language.getById(provider.inputs.id)
      .then(lang => {
        if (!lang) provider.error('id', 'custom', 'Language does not exist!');
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.language.deleteById(req.params.id);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs').get(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.show');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator(req.query, {
    limit: "required|integer",
    page: "required|integer",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors});
      return ctrls.language.paginationReq(req.query)
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.route('/langs').post(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'lang.add');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.body,
  }, {
    code: "required",
    name: "required",
    active: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors});
      return ctrls.language.create(req, res);
    })
    .catch(error => respondValidateError(res, error));
});

adminRouters.route('/upload-lang/:langCode').post(async (req, res) => {
  const { role } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!"});

  const validator = new Validator({
    langCode: req.params.langCode,
  }, {
    langCode: "required|string"
  });

  validator.addPostRule(provider => {
    return models.language.getByCode(provider.inputs.langCode)
      .then(lang => {
        if (!lang) provider.error('langCode', `custom', 'Language with code "${provider.inputs.langCode}" does not exist!`);
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      // upload file
      return ctrls.language.uploadLangFileReq(req);
    })
    .then(result => {
      if (!result.status) throw Object.assign(new Error(result.message), { code: 400 });
      return Promise.all([
        result.url,
        models.language.getByCode(req.params.langCode),
      ]);
    })
    .then(([ url, lang ]) => {
      return models.language.save({ ...lang, url });
    })
    .then(lang => {
      return res.json({
        status: true,
        message: 'success',
        data: lang
      });
    })  
    .catch(error => respondValidateError(res, error));
});



adminRouters.get('/stats', async (req, res) => {
  const { role } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!" });

  return Promise.all([
    ctrls.admin.recentPosts4Stats(),
    ctrls.admin.totalResource4Stats(),
    ctrls.admin.last7DayPosts(),
  ])
    .then(([ recentPosts, total, stats4Post ]) => {
      return res.json({
        status: true,
        message: 'success',
        recentPosts,
        total,
        stats4Post,
      });
    })
    .catch(error => respondValidateError(res, error));
});



///////////////////////////////////////////////////////////
//                                                       //
//                 N O T I F I C A T I O N               //
//                                                       //
///////////////////////////////////////////////////////////


/**@secured by admin types */
adminRouters.post('/send-notification', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.sendNotification.show');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const { uid } = getTokenInfo(req);
  const { user_id, title, body } = req.body;

  const validator = new Validator(req.body, {
    user_id: "required",
    title: "required",
    body: "required",
  });

  validator.addPostRule(async provider => 
    Promise.all([
      models.user.getById(user_id),
    ])
      .then(([ user ]) => {
        if (!user) {
          provider.error('user_id', 'custom', 'User does not exist with the given id!');
        }
      })  
  );

  return validator.check()
    .then(matched => {
      if (!matched) {
        throw Object.assign(new Error('Invalid requset!'), { code: 400, details: validator.errors });
      }
      return ctrls.admin.sendNotification2User({ user_id, title, body });
    })
    .then(() => res.json({ status: true, message: 'Notification has been sent!' }))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.post('/bulk-notifications', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.sendNotification.show');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const { uid, role } = getTokenInfo(req);
  const { user_ids, title, body } = req.body;

  const validator = new Validator(req.body, {
    user_ids: "required",
    title: "required",
    body: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) {
        throw Object.assign(new Error('Invalid requset!'), { code: 400, details: validator.errors });
      }
      return ctrls.admin.sendBulkNotification({ user_ids, title, body });
    })
    .then(() => res.json({ status: true, message: 'Notifications have been sent!' }))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.post('/consent-email/:id', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.idTransfer.show');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.adminNotification.getById(provider.inputs.id)
      .then(adminNoti => {
        if (!adminNoti) provider.error('id', 'custom', 'Data does not exist!');
        const payload = JSON.parse(adminNoti.payload);
        if (!payload.from || !payload.to) {
          provider.error('users', 'custom', 'Invalid user settings!');
        }
        if (adminNoti.type !== ADMIN_NOTI_TYPES.ID_TRANSFER) {
          provider.error('type', 'custom', 'This is for only ID Transfer!');
        }
      })
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.sendConsentEmail4Transfer(req.params.id);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

adminRouters.patch('/profile', async (req, res) => {
  const { uid: user_id, role } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!"});

  const validator = new Validator({
    user_id,
    ...req.body,
  }, {
    user_id: "required|integer",
    email: "required",
    user_name: "required",
  });

  validator.addPostRule(provider => {
    return models.admin.getById(provider.inputs.user_id)
      .then(admin => {
        if (!admin) provider.error('id', 'custom', 'Admin does not exist with the given id!');
      })
  })

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error('Invalid request!'), { code: 400, details: validator.errors});
      return ctrls.admin.updateProfileReq(user_id, req.body);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
})

adminRouters.patch('/update-password', async (req, res) => {
  const { role, uid: user_id } = getTokenInfo(req);
  if (role !== 'ADMIN') return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    user_id,
    ...req.body
  }, {
    old_pass: "required",
    password: "required",
  });

  validator.addPostRule(provider => {
    return models.admin.getById(user_id)
      .then(admin => {
        if (!admin) provider.error('id', 'custom', 'Admin does not exist!');
      });
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors() });
      return ctrls.admin.updateAdminPassword(user_id, req.body);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.patch('/config', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'settings.config');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  return ctrls.admin.updateAdminConfigReq(req.body)
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**@secured by admin types */
adminRouters.delete('/id-transfers/:id', async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'user.idTransfer.show');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.adminNotification.getById(provider.inputs.id)
      .then(adminNoti => {
        if (!adminNoti) provider.error('id', 'custom', 'Data does not exist!');
      })
  })

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.deleteIdTransferById(req.params.id);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

///////////////////////////////////////////////////////////
//                                                       //
// //////////////// E M P L O Y E E  //////////////////////
//                                                       //
///////////////////////////////////////////////////////////



/**@secured by admin types */
adminRouters.route('/employee/:id').get(async (req, res) => {
  const { role, role2 } = getTokenInfo(req);
  if (!(role === 'ADMIN' && role2 === ADMIN_ROLE.SUPER ))
    return res.json({ status: false, message: 'Permission denied!' });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return models.admin.getById(provider.inputs.id)
      .then(admin => {
        if (!admin) provider.error('id', 'custom', 'Data does not exist!');
      });
  })

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return Promise.all([
        ctrls.admin.getAdminById(req.params.id),
        ctrls.admin.getPermissionOfAdmin(req.params.id),
      ]);
    })
    .then(([admin, permission]) => res.json({
      status: true,
      message: 'success',
      data: models.admin.output(admin),
      permission: models.adminPermission.output(permission),
    }))
    .catch(error => respondValidateError(res, error))
});

/**@secured by admin types */
adminRouters.route('/employee').get(async (req, res) => {
  const { role, role2 } = getTokenInfo(req);
  if (!(role === 'ADMIN' && role2 === ADMIN_ROLE.SUPER)) res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator(req.query, {
    limit: "required",
    page: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.adminList({
        page: Number(req.query.page),
        limit: Number(req.query.limit),
      })
    })
    .then(resl => res.json(resl))
    .catch(error => respondValidateError(res, error))
});

/**@secured by admin types */
adminRouters.route('/employee').post(async (req, res) => {
  const { role, role2 } = getTokenInfo(req);
  if (!(role === 'ADMIN' && role2 === ADMIN_ROLE.SUPER)) return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    ...req.body,
  }, {
    email: "required",
    user_name: "required",
    password: "required",
  });

  validator.addPostRule(provider => Promise.all([
    models.admin.getByEmail(req.body.email),
    models.admin.getByUsername(req.body.user_name),
  ])
    .then(([ byEmail, byUserName ]) => {
      if (byEmail) provider.error('email', 'custom', "Email already taken by other administrator!");
      if (byUserName) provider.error('user_name', 'custom', 'User name already taken by other administrator!');
    })
  )

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.addEmployee(req.body);
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error))
})

/**
 * @secured by admin types
 */
adminRouters.route('/employee/:id').delete(async (req, res) => {
  const { role, role2 } = getTokenInfo(req);
  if (!(role === 'ADMIN' && role2 === ADMIN_ROLE.SUPER)) return res.json({ status: false, message: 'Permission denied!' });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => models.admin.getById(provider.inputs.id)
    .then(admin => {
      if (!admin) provider.error('id', 'custom', 'Employee does not exist with the given id!');
    }))

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.deleteEmployee(req.params.id);
    })
    .then(resl => res.json(resl))
    .catch(error => respondValidateError(res, error))
})

/**
 * @secured by admin types
 */
adminRouters.route('/employee/:id/permission').patch(async(req, res) => {
  const { role, role2, uid: user_id } = getTokenInfo(req);
  if (!(role === 'ADMIN' && role2 === ADMIN_ROLE.SUPER)) return res.json({ status: false, message: "Permission denied!" });

  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required",
  });

  validator.addPostRule(provider => {
    return Promise.all([
      models.admin.getById(provider.inputs.id),
      models.adminPermission.getByUserId(provider.inputs.id),
    ])
      .then(([admin, permission]) => {
        if (!admin) provider.error('id', 'custom', 'Admin does not exist!');
        // if (!permission) provider.error('permission', 'custom', 'Admin does not have permission!');
      });
  })

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.admin.updateEmployeePermission(req.params.id, req.body.permission)      
    })
    .then(({ admin, permission }) => res.json({
      status: true,
      message: 'Permission has been updated!',
      data: admin, permission
    }))
    .catch(error => respondValidateError(res, error))
})



///////////////////////////////////////////////////////////
//                                                       //
//                 D R I V E R   I D                     //
//                                                       //
///////////////////////////////////////////////////////////

/**
 * @secured by admin types
 * @permission 'driver-id.reject'
 */
adminRouters.route('/driver-ids/reject/:user_id').post(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'driver-id.reject');
  if (!permitted) return res.status(403).json({ status: false, message: 'Permission denied!' });

  const validator = new Validator({ ...req.params, ...req.body }, {
    user_id: "required",
    // reason: "required"
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error('Invalid request!'), { code: 400, details: validator.errors });
      return models.user.getById(req.params.user_id);
    })
    .then(user => {
      if (!user) {
        throw new Error(`Not found the user with id ${req.params.user_id}`);
      }
      if (!user.card_number) {
        throw new Error(`User don't have card number!`);
      }
      const socketClient = req.app.locals.socketClient;
      return ctrls.user.rejectIdVerification({
        user_id: Number(req.params.user_id),
        reason: req.body.reason,
        socketClient,
      });
    })
    .then(resp => res.json(resp))
    .catch(error => respondValidateError(res, error));
});


///////////////////////////////////////////////////////////
//                                                       //
//                  I D E N T I T Y                      //
//                                                       //
///////////////////////////////////////////////////////////

/**
 * @secured by admin types 
 * @permission 'identity.view'
*/
adminRouters.route('/identities').get(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'identity.view');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator(req.query, {
    limit: "required",
    page: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error("Invalid request!"), { code: 400, details: validator.errors });
      return ctrls.identity.loadIdentitiesRequest(req.query)
    })
    .then(resl => res.json(resl))
    .catch(error => respondValidateError(res, error));
});

/**
 * @secured by admin types
 * @permission 'identity.verify'
 */
adminRouters.route('/identities/:id/verify').post(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'identity.verify');
  if (!permitted) return res.status(403).json({ status: false, message: "Permission denied!" });

  const validator = new Validator(req.params, {
    id: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error('Invalid Request!'), { code: 400, details: validator.errors });
      return models.identity.getById(req.params.id);
    })
    .then(async identity => {
      if (!identity) {
        throw new Error('Identity does not exists!');
      }
      const user = await models.user.getById(identity.user_id);
      if (!user) {
        throw new Error('User does not exist!');
      }
      if (user.id_verified && identity.verified) {
        throw new Error('User identity is already verified!');
      }
      const socketClient = req.app.locals.socketClient;
      return ctrls.identity.verifyUserIdentityRequest({
        id: Number(req.params.id),
        socketClient,
      });
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

/**
 * @secured by admin types
 * @permission 'identity.verify'
 */
adminRouters.route('/identities/:id/unverify').post(async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, 'identity.verify');
  if (!permitted) return res.status(403).json({ status: false, message: 'Permission denied!' });

  const validator = new Validator(req.params, {
    id: "required",
  });

  return validator.check()
    .then(matched => {
      if (!matched) throw Object.assign(new Error('Invalid Request!'), { code: 400, details: validator.errors });
      return models.identity.getById(req.params.id);
    })
    .then(async (identity) => {
      if (!identity) {
        throw new Error('Not fond the identity with the given ID!');
      }
      const user = await models.user.getById(identity.user_id);
      if (!user) {
        throw new Error('User does not exist!');
      }
      if (!identity.verified && !user.id_verified) {
        throw new Error('User is unverified already.');
      }

      // get the socket client.
      const socketClient = req.app.locals.socketClient;
      return ctrls.identity.unverifyUserIdentityRequest({
        id: req.params.id,
        socketClient,
      });
    })
    .then(result => res.json(result))
    .catch(error => respondValidateError(res, error));
});

module.exports = adminRouters;
