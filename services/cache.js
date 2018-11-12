const redis = require('redis');
const keys = require('../config/keys');
const client = redis.createClient(keys.redisUrl);
const util = require('util');

client.hget = util.promisify(client.hget);

const mongoose = require('mongoose');
const exec = mongoose.Query.prototype.exec;

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true;
  this.hashKey = JSON.stringify(options.key || '');
  return this;
};

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) return exec.apply(this, arguments);

  // Do we have cached data in redis related to this query?
  const key = JSON.stringify(Object.assign({}, this.getQuery(), { collection: this.mongooseCollection.name }));
  const cachedValue = await client.hget(this.hashKey, key);

  // If yes, then respond to request right away
  if (cachedValue) {
    const doc = JSON.parse(cachedValue);
    return Array.isArray(doc) ? doc.map(d => new this.model(d)) : new this.model(doc);
  }

  // Else respond to request from mongoose and update cache
  const result = await exec.apply(this, arguments);
  client.hset(this.hashKey, key, JSON.stringify(result), 'EX', 100);

  return result;
};

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey));
  }
};
