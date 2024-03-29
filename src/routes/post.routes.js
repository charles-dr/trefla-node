const express = require("express");
const { Validator } = require("node-input-validator");
const postRouters = express.Router();

const postCtrl = require("../controllers/post.controller");
const Post = require("../models/post.model");
const User = require("../models/user.model");
const PostLike = require("../models/postLike.model");
const models = require("../models");
const helpers = require("../helpers");
const { BearerMiddleware } = require("../middlewares/basic.middleware");
const { getTokenInfo } = require("../helpers/auth.helpers");
const { respondValidateError } = require("../helpers/common.helpers");
const { ADMIN_ROLE } = require("../constants/common.constant");

const activity = {
  checkAdminPermission: async (req, identifier) => {
    const { role, role2, uid } = getTokenInfo(req);

    if (role !== "ADMIN") return false;
    if (role2 === ADMIN_ROLE.SUPER) return true;

    const permission = models.adminPermission.output(
      await models.adminPermission.getByUserId(uid)
    );
    return activity.checkAllowed(permission, identifier);
  },
  checkAllowed: (permission, identifier = null) => {
    if (typeof identifier === "boolean") return identifier;
    else if (
      identifier === null ||
      identifier === "" ||
      identifier === undefined
    )
      return true;

    const keys = identifier.split(".");
    if (keys.length === 1) return permission[keys[0]];
    else if (keys.length === 2) return permission[keys[0]][keys[1]];
    else if (keys.length === 3) return permission[keys[0]][keys[1]][keys[2]];
    else if (keys.length === 4)
      return permission[keys[0]][keys[1]][keys[2]][keys[3]];
    return false;
  },
};

// bearer authentication
postRouters.use((req, res, next) => {
  BearerMiddleware(req, res, next);
});

postRouters.get("/:id", async (req, res) => {
  const validator = new Validator(
    {
      id: req.params.id,
    },
    {
      id: "required|integer",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([Post.getById(provider.inputs.id)]).then(([postById]) => {
      if (!postById) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
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
    .then(() => postCtrl.getById(req, res))
    .catch((error) => respondValidateError(res, error));
});

/**@secured by admin types */
postRouters.get("/", async (req, res) => {
  const permitted = await activity.checkAdminPermission(req, "post.show");
  if (!permitted)
    return res
      .status(403)
      .json({ status: false, message: "Permission denied!" });

  const validator = new Validator(req.query, {
    type: "required|string",
    limit: "required|integer",
    page: "required|integer",
  });

  validator.addPostRule(async (provider) => {
    return Promise.all([provider.inputs.type]).then(([type]) => {
      if (!type) {
        provider.error("type", "custom", "Type param is required!");
      } else if (!["AROUND", "ALL", "ME"].includes(type)) {
        provider.error("type", "custom", "Invalid type parameter!");
      }
    });
  });

  return validator
    .check()
    .then((matched) => {
      if (!matched) {
        throw Object.assign(new Error("Invalid request"), {
          code: 400,
          details: validator.errors,
        });
      }
      return postCtrl.simplePagination(req, res);
    })
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/pagination", async (req, res) => {
  const validator = new Validator(req.body, {
    // last_id: "required|integer",
    type: "required|string",
    limit: "required|integer",
  });

  validator.addPostRule(async (provider) =>
    Promise.all([provider.inputs.type]).then(([type]) => {
      if (!type) {
        provider.error("type", "custom", "Type param is required!");
      } else if (!["AROUND", "ALL", "ME"].includes(type)) {
        provider.error(
          "type",
          "custom",
          `Type param must be of of "AROUND", "ALL", "ME"!`
        );
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
    .then(() => postCtrl.pagination(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/:id/toggle-like", async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { type } = req.body;
  const validator = new Validator(
    {
      id: req.params.id,
      user_id,
      type,
    },
    {
      id: "required|integer",
      user_id: "required|integer",
      type: "required|integer|between:1,6",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([
      Post.getById(provider.inputs.id),
      User.getById(provider.inputs.user_id),
    ]).then(([post, user]) => {
      if (!post) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
      }
      if (!user) {
        provider.error(
          "id",
          "custom",
          `User with id "${provider.inputs.user_id}" does not exists!`
        );
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
    .then(() => postCtrl.togglePostLike(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/:id/like", async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { type } = req.body;
  const validator = new Validator(
    {
      id: req.params.id,
      user_id,
      type,
    },
    {
      id: "required|integer",
      user_id: "required|integer",
      type: "required|integer|between:1,6",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([
      Post.getById(provider.inputs.id),
      User.getById(provider.inputs.user_id),
    ]).then(([post, user]) => {
      if (!post) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
      }
      if (!user) {
        provider.error(
          "id",
          "custom",
          `User with id "${provider.inputs.user_id}" does not exists!`
        );
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
    .then(() => postCtrl.doLikePost(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/:id/dislike", async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { type } = req.body;
  const validator = new Validator(
    {
      id: req.params.id,
      user_id,
      type,
    },
    {
      id: "required|integer",
      user_id: "required|integer",
      type: "required|integer|between:1,6",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([
      Post.getById(provider.inputs.id),
      User.getById(provider.inputs.user_id),
    ]).then(([post, user]) => {
      if (!post) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
      }
      if (!user) {
        provider.error(
          "id",
          "custom",
          `User with id "${provider.inputs.user_id}" does not exists!`
        );
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
    .then(() => postCtrl.disLikePost(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/:id/liked-users", async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const validator = new Validator(
    {
      id: req.params.id,
      user_id,
    },
    {
      id: "required|integer",
      user_id: "required|integer",
    }
  );
  validator.addPostRule(async (provider) =>
    Promise.all([Post.getById(provider.inputs.id)]).then(([post]) => {
      if (!post) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exist!`
        );
      }
    })
  );

  return validator
    .check()
    .then((matched) => {
      if (!matched) {
        throw Object.assign(new Error("Invalid request!"), {
          code: 400,
          details: validator.errors,
        });
      }
      return postCtrl.getLikedUserList(req, res);
    })
    .catch((error) => respondValidateError(res, error));
});

postRouters.post("/", async (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const validator = new Validator(
    {
      ...req.body,
      post_user_id: user_id,
    },
    {
      post_user_id: "required|integer",
      type: "required",
      feed: "required",
      post_name: "required",
      // location_area: "required",
      location_address: "required",
      location_coordinate: "required",
      // city: "required",
    }
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
    .then(() => postCtrl.create(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.patch("/:id", async (req, res) => {
  const validator = new Validator(
    {
      id: req.params.id,
    },
    {
      id: "required|integer",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([Post.getById(provider.inputs.id)]).then(([postById]) => {
      if (!postById) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
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
    .then(() => postCtrl.updateById(req, res))
    .catch((error) => respondValidateError(res, error));
});

postRouters.delete("/:id", async (req, res) => {
  const { uid, role } = getTokenInfo(req);
  const validator = new Validator(
    {
      id: req.params.id,
    },
    {
      id: "required|integer",
    }
  );

  validator.addPostRule(async (provider) =>
    Promise.all([Post.getById(provider.inputs.id)]).then(([postById]) => {
      if (!postById) {
        provider.error(
          "id",
          "custom",
          `Post with id "${provider.inputs.id}" does not exists!`
        );
      } else if (role !== "ADMIN" && postById.user_id !== uid) {
        provider.error("creator", "custom", "You can't delete post!");
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
    .then(() => postCtrl.deleteById(req, res))
    .catch((error) => respondValidateError(res, error));
});

module.exports = postRouters;
