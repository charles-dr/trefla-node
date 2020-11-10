const sql = require("./db");
const { timestamp, int2Bool } = require("../helpers/common.helpers");

const Chat = function (lang) {
  this.create_time = timestamp();
  this.update_time = timestamp();
};

Chat.create = (model) => {
  model.id !== undefined ? delete model.id : '';
  return new Promise((resolve, reject) => {
    sql.query("INSERT INTO chats SET ?", model, (err, res) => {
			err ? reject(err) : resolve({ ...model, id: res.insertId });
    });
  });
};

Chat.save = async (model) => {
  model.update_time = timestamp();
  return new Promise((resolve, reject) => {
    sql.query("UPDATE chats SET ? WHERE id=?", [model, model.id], (err, res) => {
      err ? reject(err) : resolve(Chat.getById(model.id));
    });
  });
}

Chat.deleteById = async (id) => {
  return new Promise((resolve, reject) => {
    sql.query("DELETE FROM chats WHERE id=?", [id], (err, res) => {
      err ? reject(err) : resolve(res.affectedRows > 0);
    })
  })
}

Chat.pagination = async ({ limit, offset, user_id = null, isForCard = null, card_number = null }) => {
  let where = [];
  if (user_id) {
    where.push(`JSON_SEARCH(user_ids, 'one', ${user_id}) IS NOT NULL`);
  }
  if (isForCard !== null && [0, 1].includes(isForCard)) {
    where.push(`isForCard=${isForCard}`);
  }
  if (card_number) {
    where.push(`card_number='${card_number}'`);
  }
  const strWhere = ' WHERE ' + where.join(' AND ');
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM chats ${strWhere} LIMIT ? OFFSET ? `, [limit, offset], (err, res) => {
      err ? reject(err) : resolve(res);
    })
  });
}

Chat.pendingChatrooms = async (user_id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM chats WHERE (JSON_SEARCH(user_ids, 'one', ?) IS NOT NULL) AND accept_status=?`, [user_id, 0], (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
}

Chat.myChatrooms = async (user_id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM chats WHERE (JSON_SEARCH(user_ids, 'one', ?) IS NOT NULL) AND accept_status=?`, [user_id, 1], (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
}

Chat.getAll = ({ user_id = null, isForCard = null, card_number = null }) => {
  let where = [];
  if (user_id) {
    where.push(`JSON_SEARCH(user_ids, 'one', ${user_id}) IS NOT NULL`);
  }
  if (isForCard !== null && [0, 1].includes(isForCard)) {
    where.push(`isForCard=${isForCard}`);
  }
  if (card_number) {
    where.push(`card_number='${card_number}'`);
  }
  const strWhere = ' WHERE ' + where.join(' AND ');
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM chats ${strWhere}`, (err, res) => {
			err ? reject(err) : resolve(res);
    });
  });
};

Chat.getById = (id) => {
  return new Promise((resolve, reject) => {
    sql.query("SELECT * FROM chats WHERE id=? LIMIT 1", [id], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

Chat.getByUserIds = ({ sender_id, receiver_id, isForCard = 0 }) => {
  let where = [sender_id, receiver_id].map(user_id => `(JSON_SEARCH(user_ids, 'one', ${user_id}) IS NOT NULL)`);
  where.push(`isForCard = ${isForCard}`);
  const strWhere = ' WHERE ' + where.join(' AND ');

  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM chats ${strWhere}`, [], (err, res) => {
      err ? reject(err) : resolve(res);
    });
  });
}

Chat.output = (model) => {
  // JSON parse
  model.unread_nums = JSON.parse(model.unread_nums || "");
  model.online_status = JSON.parse(model.online_status || "");
  model.last_messages = JSON.parse(model.last_messages || "");
  model.user_ids = JSON.parse(model.user_ids || "");

  const delKeys = ['create_time', 'update_time'];

  delKeys.forEach(key => {
    model[key] !== undefined ? delete model[key] : null;
  })
  return model;
}

module.exports = Chat;