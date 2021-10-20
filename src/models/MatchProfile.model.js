const sql = require('./db');
const { IMatchProfile } = require('../types');
const { timestamp } = require('../helpers/common.helpers');

const table = 'match_profiles';

class MatchProfile extends IMatchProfile {
  constructor(args) {
    super(args);
  }

  save() {
    const model = this.toDB();
    if (this.id === 0) {
      delete model.id;
      return new Promise((resolve, reject) => {
        sql.query(`INSERT INTO ${table} SET ?`, model, (err, res) => {
          err ? reject(err) : resolve({ id: res.insertId, ...model });
        });
      });
    } else {
      model.update_time = timestamp();
      return new Promise((resolve, reject) => {
        sql.query(`UPDATE ${table} SET ? where id=?`, [model, model.id], (err, res) => {
          err ? reject(err) : resolve(MatchProfile.getById(model.id));
        });
      });
    }
  }
}

MatchProfile.getById = (id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM ${table} WHERE id=?`, [id], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

MatchProfile.getByUserId = (user_id) => {
  return new Promise((resolve, reject) => {
    sql.query(`SELECT * FROM ${table} WHERE user_id=?`, [user_id], (err, res) => {
      err ? reject(err) : resolve(res[0]);
    });
  });
}

module.exports = MatchProfile;
