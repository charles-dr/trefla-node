const { Validator } = require("node-input-validator");
const User = require("../models/user.model");
const Post = require("../models/post.model");
const Comment = require("../models/comment.model");
const CommentLike = require("../models/commentLike.model");
const { getTokenInfo } = require('../helpers/auth.helpers');
const { bool2Int, getTotalLikes, generateTZTimeString, respondError } = require("../helpers/common.helpers");
const { generateCommentData, generateCommentLikeData } = require('../helpers/model.helpers');

exports.create = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  let commentData = generateCommentData(req.body);
  commentData.user_id = user_id;
  commentData.time = req.body.time ? req.body.time : generateTZTimeString();
  // commentData.isGuest = bool2Int(req.body.isGuest);

  return Comment.create(commentData)
    .then(comment => Promise.all([
      comment,
      User.getById(comment.user_id)
    ]))
    .then(([comment, user]) => {
      comment = Comment.output(comment);
      return res.json({ status: true, message: "success", data: { ...comment, liked: 0, user: User.output(user) } });
    })
    .catch((error) => respondError(res, error));
};

exports.getById = (req, res) => {
  const { id } = req.params;
  return Comment.getById(id)
    .then(comment => Promise.all([
      comment,
      User.getById(comment.user_id),
      CommentLike.commentLikesOfUser({ comment_id: id, user_id: comment.user_id })
    ]))
    .then(([comment, user, likes]) => {
      console.log('[Likes]', likes);
      comment = Comment.output(comment);
      return res.json({ status: true, message: "success", data: { 
        ...comment, 
        liked: likes.length > 1 ? 1 : 0, 
        user: User.output(user) } });
    })
    .catch((error) => respondError(res, error));
}

exports.pagination = (req, res) => {
  const { uid } = getTokenInfo(req);
  const { page, limit, target_id, type } = req.body;
  const offset = page * limit;
  let _comments = [], _total = 0, _posters = {};

  return Promise.all([
    Comment.pagination({ limit, offset, target_id, type }),
    Comment.getCountOfComments({ target_id, type }),
  ])
    .then(async ([comments, total]) => {
      _comments = comments; _total = total;
      const poster_ids = comments.map(comment => comment.user_id);
      return User.getByIds(poster_ids);
    })
    .then(users => {
      users.map(user => _posters[user.id] = user);
      return Promise.all(_comments.map(comment => CommentLike.commentLikesOfUser({ user_id: uid, comment_id: comment.id })));
    })
    .then((commentLikedArray) => {
      // console.log('[Liked]', uid, commentLikedArray.map(a => a.length));
      // console.log('[posters]', _posters);
      _comments = _comments.map(comment => Comment.output(comment)); // filter keys

      _comments = _comments.map((comment, i) => ({
        ...comment,
        liked: commentLikedArray[i].length > 0 ? 1 : 0,
        user: User.output(_posters[comment.user_id])
      }));

      return res.json({
        status: true,
        message: 'success',
        data: _comments,
        pager: {
          page,
          limit,
          total: _total
        },
        hadMore: (limit * page + _comments.length) < _total
      });
    })
    .catch((error) => respondError(res, error));
}

// to-do: only admin or creator can update
exports.updateById = (req, res) => {
  const { id } = req.params;
  return Comment.getById(id)
    .then(comment => {
      // remove user id in update data
      let updateData = {};
      const disallowedKeys = ['id', 'user_id', 'target_id', 'type'];
      Object.keys(req.body).forEach(key => {
        if (disallowedKeys.includes(key)) {
          // skip it
        } else if (key === 'isGuest') {
          comment.isGuest = bool2Int(req.body.isGuest);
        } else if (comment[key] !== undefined) {
          comment[key] = req.body[key];
        }
      });
      return Comment.save(comment);      
    })
    .then(newComment => res.json({
      status: true,
      message: 'success',
      data: Comment.output(newComment)
    }))
    .catch((error) => respondError(res, error));
}

exports.getAll = (req, res) => {
  Post.getAll()
    .then((langs) =>
      res.json({ status: true, message: "success", data: langs })
    )
    .catch((error) =>
      res.status(500).json({
        status: false,
        message: error.message || "Something went wrong!",
      })
    );
};

exports.toggleCommentLike = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { id: comment_id } = req.params;
  const { type } = req.body;
  return CommentLike.userLikedComment({ user_id, comment_id, type })
    .then(postLike => {
      return postLike ? dislikeComment({ user_id, comment_id, type }) : likeComment({ user_id, comment_id, type });
    })
    .then(result => res.json({
      status: !!result,
      message: result ? 'success' : 'failed'
    }))
    .catch((error) => respondError(res, error));
}

exports.doLikeComment = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { id: comment_id } = req.params;
  const { type } = req.body;
  return CommentLike.userLikedComment({ user_id, comment_id, type })
    .then(liked => {
      if (liked) {
        throw Object.assign(new Error('You liked it already!'), { code: 400 });
      } else {
        return likeComment({ user_id, comment_id, type });
      }
    })
    .then(result => res.json({
      status: !!result,
      message: result ? 'You liked the comment!' : 'Failed to like the comment!'
    }))
    .catch((error) => respondError(res, error));
}

exports.dislikeComment = (req, res) => {
  const { uid: user_id } = getTokenInfo(req);
  const { id: comment_id } = req.params;
  const { type } = req.body;
  return CommentLike.userLikedComment({ user_id, comment_id, type })
    .then(liked => {
      if (liked) {
        return dislikeComment({ user_id, comment_id, type });
      } else {
        throw Object.assign(new Error('You disliked it already!'), { code: 400 });
      }
    })
    .then(result => res.json({
      status: !!result,
      message: result ? 'You disliked the comment!' : 'Failed to dislike the comment!'
    }))
    .catch((error) => respondError(res, error));
}

const dislikeComment = ({ user_id, comment_id, type }) => {
  return Promise.all([
    Comment.getById(comment_id),
    CommentLike.userLikedComment({ user_id, comment_id, type })
  ])
    .then(([comment, commentLike]) => {
      const like_fld = `like_${type}_num`;
      comment[like_fld] = comment[like_fld] ? comment[like_fld] - 1 : 0;
      comment['liked'] = getTotalLikes(comment);
      return Promise.all([
        CommentLike.deleteById(commentLike.id),
        Comment.save(comment)
      ])
    })
    .then(([deleted, newPost]) => {
      return deleted && newPost;
    })
    .catch((error) => false);
}

const likeComment = ({ user_id, comment_id, type }) => {
  return Promise.all([
    Comment.getById(comment_id),
    CommentLike.userLikedComment({ user_id, comment_id, type })
  ])
    .then(([comment, commentLike]) => {
      if (commentLike) {
        throw Object.assign(new Error('You liked this comment already!'), { code: 400 }); return;
      }
      const like_fld = `like_${type}_num`;
      comment[like_fld] = comment[like_fld] + 1;
      comment['liked'] = getTotalLikes(comment);

      const cmtData = generateCommentLikeData({ user_id, comment_id, type });
      return Promise.all([
        CommentLike.create(cmtData),
        Comment.save(comment)
      ])
    })
    .then(([created, newCmt]) => {
      return created && newCmt;
    })
    .catch((error) => {
      console.log('[Like Comment]', error.message);
      return false
    });
}
