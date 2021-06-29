const { v4: uuid } = require('uuid');
const express = require("express");
const { Validator } = require("node-input-validator");
const photoRouters = express.Router();
const formidable = require('formidable');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../config/app.config');
const photoCtrl = require("../controllers/photo.controller");
const Photo = require('../models/photo.model');
const User = require('../models/user.model');
const { BearerMiddleware } = require("../middlewares/basic.middleware");
const { getTokenInfo } = require('../helpers/auth.helpers');
const { respondValidateError } = require("../helpers/common.helpers");

const activity = {
  confirmDirPath: (parent, name) => {
    const dirPath = path.join(parent, name);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
      return dirPath;
    }
    return false;
  },
}

// bearer authentication
photoRouters.use((req, res, next) => {
  BearerMiddleware(req, res, next);
});

photoRouters.get('/user/:id', async (req, res) => {
  const validator = new Validator({
    id: req.params.id,
  }, {
    id: "required|integer",
  });

  validator.addPostRule(async (provider) => {
    User.getById(provider.inputs.id)
      .then(user => {
        if (!user) {
          provider.error("id", "custom", "User doesn't exist with the given id!");
        }
      })
  });

  return validator.check()
    .then(matched => {
      if (!matched) {
        throw Object.assign(new Error("Invalid request"), { code: 400, details: validator.errors,});
      }
    })
    .then(() => photoCtrl.getByUserIdReq(req, res))
    .then(result => res.json(result))
    .catch((error) => respondValidateError(res, error));
});

photoRouters.get('/:id', async (req, res) => {
  const validator = new Validator({
    id: req.params.id
  }, {
    id: "required|integer",
  });

  validator.addPostRule(async (provider) =>
    Promise.all([
      Photo.getById(provider.inputs.id)
    ]).then(([byId]) => {
      if (!byId) {
        provider.error("id", "custom", `Photo with id "${provider.inputs.id}" does not exists!`);
      }
    })
  );

  return validator
  .check()
  .then((matched) => {
    if (!matched) {
      throw Object.assign(new Error("Invalid request"), {
        code: 400,
        details: validator.errors,
      });
    }
  })
  .then(() => photoCtrl.getById(req, res))
  .catch((error) => respondValidateError(res, error));
})

photoRouters.get('/', async (req, res) => {
  return photoCtrl.getAllOfUser(req, res)
    .catch(error => respondValidateError(res, error));
});

photoRouters.post('/upload', async (req, res) => {
  const type = req.body.type || 'normal';
  return res.json(req.body);

  let form = formidable.IncomingForm();
  form.parse(req, function(err, fields, files) {
    let oldpath = files.file.path;
    let ext = path.extname(files.file.name);// console.log('[old path]', oldpath, ext)
    let newName = `${uuid()}${ext}`;

    const dirPath = activity.confirmDirPath(path.resolve('assets/uploads'), type);

    if (!dirPath) {
      return res.json({
        'status': false,
        'message': 'Failed to create path!',
      });
    }

    let newpath = path.join(dirPath, newName);
    fs.readFile(oldpath, function(err, data) {
      if (err) {
        return res.json({
          status: false,
          message: 'Failed to read file...',
          details: err.message,
        });
      }
      fs.writeFile(newpath, data, async function(err) {
        if (err) {
          return res.json({
            status: false,
            message: 'Failed to write file...',
            details: err.message,
          });
        }
        fs.unlink(oldpath, function(err) {
          if (err) {
            return res.json({
              status: false,
              message: 'Failed to delete file...',
              details: err.message,
            });
          }
        })

        return res.json({
          status: true,
          message: 'File has been uploaded!',
          url: `${config.domain}/uploads/${newName}`,
        })
      })
    });
  })
});

photoRouters.post('/', async (req, res) => {

  const validator = new Validator({
    ...req.body 
  }, {
    url: "required"
  });

  return validator.check()
    .then(matched => {
      if (!matched) {
        throw Object.assign(new Error("Invalid request"), {
          code: 400,
          details: validator.errors,
        });
      }
    })
    .then(() => photoCtrl.create(req, res))
    .catch(error => respondValidateError(res, error));
});

photoRouters.delete('/:id', async (req, res) => {
  const validator = new Validator({
    id: req.params.id
  }, {
    id: "required|integer",
  });

  validator.addPostRule(async (provider) =>
    Promise.all([
      Photo.getById(provider.inputs.id)
    ]).then(([byId]) => {
      if (!byId) {
        provider.error("id", "custom", `Photo with id "${provider.inputs.id}" does not exists!`);
      }
    })
  );

  return validator
  .check()
  .then((matched) => {
    if (!matched) {
      throw Object.assign(new Error("Invalid request"), {
        code: 400,
        details: validator.errors,
      });
    }
  })
  .then(() => photoCtrl.deleteById(req, res))
  .catch((error) => respondValidateError(res, error));
});

module.exports = photoRouters;
