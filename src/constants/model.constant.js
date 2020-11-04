const { timestamp } = require('../helpers/common.helpers');

exports.DEFAULT_USER = {
  id: 0,
  user_name: '',
  email: '',
  password: '',
  sex: 0,
  birthday: '',
  language: 'English',
  bio: '',
  isGuest: 0,
  guestName: '',
  card_number: '',
  card_img_url: '',
  card_verified: 0,
  avatarIndex: 0,
  photo: '',
  radiusAround: 100,
  device_token: '',
  noti_num: 0,
  location_coordinate: '',
  location_address: '',
  location_array: JSON.stringify([]),
  postAroundCenterCoordinate: '',
  city: '',
  recovery_code: '',
  active: 0,
  create_time: timestamp(),
  update_time: timestamp()
};

exports.DEFAULT_POST = {
  id: '',
  user_id: 0,
  post_name: '',
  feed: '',
  isGuest: 0,
  type: "1",
  target_date: "",
  option_val: '',
  comment_num: 0,
  liked: 0,
  like_1_num: 0,
  like_2_num: 0,
  like_3_num: 0,
  like_4_num: 0,
  like_5_num: 0,
  like_6_num: 0,
  location_address: '',
  location_coordinate: '',
  city: '',
  active: 0,
  post_time: '2020-01-01-00-00-00:180',
  create_time: timestamp(),
  update_time: timestamp(),
};

exports.DEFAULT_COMMENT = {
  id: '',
  user_id: 0,
  comment: '',
  target_id: 0,
  type: 'POST',
  comment_num: 0,
  isGuest: 0,
  like_1_num: 0,
  like_2_num: 0,
  like_3_num: 0,
  like_4_num: 0,
  like_5_num: 0,
  like_6_num: 0,
  active: 1,
  time: '',
  create_time: timestamp(),
  update_time: timestamp(),
};

exports.DEFAULT_NOTIFICATION = {
  id: '',
  sender_id: 0,
  receiver_id: 0,
  type: 0,
  optional_val: 0,
  time: '',
  create_time: timestamp(),
  update_time: timestamp(),
};

exports.DEFAULT_POSTLIKE = {
  id: '',
  user_id: 0,
  post_id: 0,
  type: 0,
  create_time: timestamp(),
  update_time: timestamp(),
}

exports.DEFAULT_COMMENTLIKE = {
  id: '',
  user_id: 0,
  comment_id: 0,
  type: 0,
  create_time: timestamp(),
  update_time: timestamp(),
}

