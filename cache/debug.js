"use strict";

/**
 * For debugging caches in an express APP
 *
 **/

var hostname = require('os').hostname();

var caches = {};
var index = 0;

var debug = {
  register: function(cache,name) {
    var cname = name || ('anon_' + index++);
    caches[cname] = cache;
    return cache;
  }
};

module.exports = debug;
