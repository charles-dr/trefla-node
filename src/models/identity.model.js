const sql = require("./db");
const config = require('../config/app.config');
const { timestamp, photoHash } = require("../helpers/common.helpers");

const table = 'identities';

const Identity = function () {
  this.create_time = timestamp();
  this.update_time = timestamp();
};

Identity.create = (model) => {
  delete model.id;
  return new Promise((resolve, reject) => {
    sql.query(`INSERT INTO ${table} SET ?`, model, (err, res) => {
			err ? reject(err) : resolve({ id: res.insertId, ...model });
    });
  });
};

Identity.save = async (model) => {
  model.update_time = timestamp();
  return new Promise((resolve, reject) => {
    sql.query(`UPDATE ${table} SET ? WHERE id=?`, [model, model.id], (err, res) => {
      err ? reject(err) : resolve(Identity.getById(model.id));
    });
  });
}

Identity.getById = (id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM ${table} WHERE id=?`, [id], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

Identity.getByUser = (user_id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM ${table} WHERE user_id=?`, [user_id], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

Identity.pagination = ({ limit, page }) => {
  limit = Number(limit);
  page = Number(page);
  const offset = limit * page;

  let where = [];
  
  const strWhere = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  return new Promise((resolve, reject) => {
    sql.query(`SELECT ${table}.*, users.user_name, users.email, users.photo, users.avatarIndex, users.sex
      FROM ${table}
      LEFT JOIN users ON users.id = ${table}.user_id
      ${strWhere}
      ORDER BY identities.id DESC LIMIT ? OFFSET ?
      `, [limit, offset], (err, res) => {
        err ? reeject(err) : resolve(res);
    });
  });
}

Identity.getTotal = () => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT COUNT(id) as total FROM ${table}`, [], (err, res) => {
      err ? reject(err) : resolve(res[0].total);
    });
  });
}

Identity.deleteByUser = (user_id) => {
  return new Promise((resolve, reject) => {
    sql.query(`DELETE FROM ${table} WHERE user_id=?`, [user_id], (err, res) => {
      err ? reject(err) : resolve(res.affectedRows > 0);
    });
  });
}

Identity.deleteById = (id) => {
  return new Promise((resolve, reject) => {
    sql.query(`DELETE FROM ${table} WHERE id=?`, [id], (err, res) => {
      err ? reject(err) : resolve(res.affectedRows > 0);
    });
  })
}

Identity.output = (model) => {
  // ['create_time', 'update_time'].map(key => delete model[key]);
  return model;
}

module.exports = Identity;
