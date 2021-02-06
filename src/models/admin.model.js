const sql = require("./db");
const { timestamp } = require("../helpers/common.helpers");

const table = 'admins';

const Admin = function (lang) {
  this.create_time = timestamp();
  this.update_time = timestamp();
};

Admin.create = (model) => {
  model.id !== undefined ? delete model.id : '';
  return new Promise((resolve, reject) => {
    sql.query(`INSERT INTO ${table} SET ?`, model, (err, res) => {
			err ? reject(err) : resolve({ ...model, id: res.insertId });
    });
  });
};

Admin.save = (model) => {
  return new Promise((resolve, reject) => {
    sql.query(`UPDATE ${table} SET ? WHERE id=?`, [model, model.id], (err, res) => {
      err ? reject(err): resolve(Admin.getById(model.id));
    });
  });
}

Admin.getByEmail = (email) => {
  return new Promise((resolve, reject) => {
    sql.query("SELECT * FROM admins WHERE email=?", [email], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

Admin.getByUsername = (user_name) => {
  return new Promise((resolve, reject) => {
    sql.query("SELECT * FROM admins WHERE user_name=?", [user_name], (err, res) => {
      err ? reject(err): resolve(res[0]);
    });
  });
}

Admin.getById = async (id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM ${table} WHERE id=?`, [id], (err, res) => {
      err ? reject(err): resolve(res[0]);
    });
  });
}

Admin.output = (model) => {
  ['create_time', 'update_time'].map(key => delete model[key]);
  return model;
}

module.exports = Admin;
