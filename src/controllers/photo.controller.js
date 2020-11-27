const { Validator } = require("node-input-validator");
const Photo = require("../models/photo.model");
const { getTokenInfo } = require('../helpers/auth.helpers');
const { bool2Int, generateTZTimeString, respondError } = require("../helpers/common.helpers");
const { generatePhotoData } = require('../helpers/model.helpers');

exports.create = (req, res) => {
  const { uid } = getTokenInfo(req);
  let model = generatePhotoData({ ...req.body, user_id: uid });
  
  return Photo.create(model)
    .then((pl) => res.json({ status: true, message: "success", data: Photo.output(pl) }))
    .catch((error) => respondError(res, error));
};

exports.getAllOfUser = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  return Photo.getByUser(user_id)
    .then((photos) => {
      return res.json({
        status: true,
        message: 'success',
        data: photos.map(photo => Photo.output(photo))
      });
    });
}

exports.getById = (req, res) => {
  const { id } = req.params;
  return Photo.getById(id)
    .then(photo => res.json({ 
      status: true,
      message: 'success',
      data: Photo.output(photo)
    }))
    // .catch((error) => respondError(res, error));
}

exports.getByUserIdReq = (req, res) => {
  const { id: user_id } = req.params;
  return Photo.getByUser(user_id)
    .then(photos => {
      return {
        status: true,
        message: 'success',
        data: photos.map(photo => Photo.output(photo)),
      };
    });
}

exports.deleteById = (req, res) => {
  const { id } = req.params;
  return Photo.deleteById(id)
    .then(deleted => {
      return res.json({
        stauts: true,
        message: 'Photo has been deleted!'
      });
    });
}